import { expect, test } from '@playwright/test';

const TEAM_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02';
const CHALLENGE_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03';

const profile = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 1,
  xp: 0,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: {},
  badges: []
};

const challenge = {
  id: CHALLENGE_ID,
  title: 'Trier une liste',
  theme: 'Algorithmique',
  type: 'sorting',
  difficulty: 2,
  status: 'available',
  bestScore: null,
  statement: 'Triez la liste fournie.',
  languages: ['python'],
  basePoints: 200,
  perfMax: 80,
  currentVersion: 1,
  hints: [],
  missingPrerequisites: []
};

/**
 * Transport temps réel simulé (T152) : le stub Socket.IO diffuse les updates
 * Yjs entre onglets via `BroadcastChannel`, sans API ni backend. Monaco est
 * également simulé pour que le scénario ne dépende pas du CDN du loader :
 * le vrai `Y.Doc`, le vrai `MonacoBinding` et le vrai hook restent exercés.
 *
 * Cette fonction est sérialisée par Playwright : elle ne doit référencer
 * aucune variable extérieure.
 */
function installCollaborationStub(): void {
  const channel = new BroadcastChannel('codequest-e2e-collab');
  const clientId = crypto.randomUUID();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const remoteClients = new Map<string, { docId: string; cursor: { line: number; ch: number } }>();
  let lastDocId = '';
  let cursor = { line: 0, ch: 0 };

  const host = window as unknown as {
    monaco: unknown;
    __codequestSocketFactory: () => unknown;
    __codequestSetEditorValue(value: string): void;
    __codequestGetEditorValue(): string;
    __codequestSetCursor(next: { line: number; ch: number }): void;
  };

  function emit(event: string, payload: unknown): void {
    const callbacks = listeners.get(event);
    if (callbacks) for (const callback of callbacks) callback(payload);
  }

  function notifyAwareness(docId: string): void {
    const clients: Array<{ userId: string; cursor: { line: number; ch: number } }> = [
      { userId: clientId, cursor }
    ];
    for (const [id, state] of remoteClients) {
      if (state.docId === docId) clients.push({ userId: id, cursor: state.cursor });
    }
    emit('doc.awareness', { data: { clients } });
  }

  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as {
      from: string;
      type: string;
      docId?: string;
      update?: string;
      cursor?: { line: number; ch: number };
    };
    if (message.from === clientId) return;
    if (message.type === 'update' && message.update) {
      emit('doc.update', { data: { update: message.update } });
    } else if (message.type === 'awareness' && message.docId && message.cursor) {
      remoteClients.set(message.from, { docId: message.docId, cursor: message.cursor });
      notifyAwareness(message.docId);
    } else if (message.type === 'leave' && message.docId) {
      remoteClients.delete(message.from);
      notifyAwareness(message.docId);
    }
  };

  host.__codequestSocketFactory = () => {
    let disconnected = false;
    return {
      on(event: string, callback: (payload: unknown) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)?.add(callback);
      },
      emit(event: string, payload: { docId?: string; update?: string; cursor?: { line: number; ch: number } }) {
        if (disconnected) return;
        if (event === 'doc.update' && payload.docId && payload.update) {
          lastDocId = payload.docId;
          channel.postMessage({ from: clientId, type: 'update', docId: payload.docId, update: payload.update });
        } else if (event === 'doc.awareness' && payload.docId && payload.cursor) {
          lastDocId = payload.docId;
          cursor = payload.cursor;
          channel.postMessage({
            from: clientId,
            type: 'awareness',
            docId: payload.docId,
            cursor: payload.cursor
          });
          notifyAwareness(payload.docId);
        }
      },
      disconnect() {
        disconnected = true;
        if (lastDocId) channel.postMessage({ from: clientId, type: 'leave', docId: lastDocId });
        listeners.clear();
      }
    };
  };

  // Modèle Monaco minimal : ses mutations alimentent `MonacoBinding`, qui
  // écrit dans le Y.Doc ; les updates distants repassent par `applyEdits`.
  const models: Array<{
    getValue(): string;
    setValue(value: string): void;
    applyEdits(edits: Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>): void;
    onDidChangeContent(callback: (event: { changes: Array<{ rangeOffset: number; rangeLength: number; text: string }> }) => void): { dispose(): void };
    onWillDispose(callback: () => void): { dispose(): void };
    getPositionAt(offset: number): { lineNumber: number; column: number };
    getOffsetAt(position: { lineNumber: number; column: number }): number;
    getFullModelRange(): { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
    dispose(): void;
    uri: { path: string };
  }> = [];

  function createModel(value: string) {
    let text = String(value ?? '');
    const contentCallbacks = new Set<(event: { changes: Array<{ rangeOffset: number; rangeLength: number; text: string }> }) => void>();
    const disposeCallbacks = new Set<() => void>();

    function offsetAt(position: { lineNumber: number; column: number }): number {
      const lines = text.split('\n');
      let offset = 0;
      for (let line = 1; line < position.lineNumber && line <= lines.length; line += 1) {
        offset += (lines[line - 1] ?? '').length + 1;
      }
      const line = lines[Math.min(Math.max(position.lineNumber, 1), lines.length) - 1] ?? '';
      return offset + Math.min(Math.max(position.column - 1, 0), line.length);
    }

    function notify(changes: Array<{ rangeOffset: number; rangeLength: number; text: string }>): void {
      for (const callback of contentCallbacks) callback({ changes });
    }

    const model = {
      uri: { path: `inmemory://collab/${models.length}` },
      getValue: () => text,
      setValue(next: string) {
        const previous = text;
        text = String(next ?? '');
        notify([{ rangeOffset: 0, rangeLength: previous.length, text }]);
      },
      applyEdits(edits: Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>) {
        const startOf = (range: { startLineNumber: number; startColumn: number }): number =>
          offsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
        const changes = [...edits]
          .sort((a, b) => startOf(b.range) - startOf(a.range))
          .map((edit) => {
            const start = startOf(edit.range);
            const end = offsetAt({
              lineNumber: edit.range.endLineNumber,
              column: edit.range.endColumn
            });
            const inserted = String(edit.text ?? '');
            text = text.slice(0, start) + inserted + text.slice(end);
            return { rangeOffset: start, rangeLength: Math.max(end - start, 0), text: inserted };
          });
        notify(changes);
      },
      onDidChangeContent(callback: (event: { changes: Array<{ rangeOffset: number; rangeLength: number; text: string }> }) => void) {
        contentCallbacks.add(callback);
        return { dispose: () => contentCallbacks.delete(callback) };
      },
      onWillDispose(callback: () => void) {
        disposeCallbacks.add(callback);
        return { dispose: () => disposeCallbacks.delete(callback) };
      },
      getPositionAt(offset: number) {
        const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
        const lines = before.split('\n');
        return { lineNumber: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 };
      },
      getOffsetAt: offsetAt,
      getFullModelRange() {
        const lines = text.split('\n');
        return {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: lines.length,
          endColumn: (lines[lines.length - 1] ?? '').length + 1
        };
      },
      dispose() {
        for (const callback of disposeCallbacks) callback();
      }
    };
    models.push(model);
    return model;
  }

  const cursorCallbacks = new Set<(event: { position: { lineNumber: number; column: number } }) => void>();

  host.monaco = {
    Uri: {
      parse(path: string) {
        return { path, toString: () => path };
      }
    },
    editor: {
      EditorOption: { readOnly: 1 },
      createModel(value: string) {
        return createModel(value);
      },
      getModel() {
        return undefined;
      },
      create(_container: unknown, options?: { model?: ReturnType<typeof createModel> }) {
        let model = options?.model ?? createModel('');
        return {
          getModel: () => model,
          setModel(next: typeof model) {
            model = next;
          },
          getOption: (option: number) => (option === 1 ? false : undefined),
          getValue: () => model.getValue(),
          setValue(value: string) {
            model.setValue(value);
          },
          executeEdits(_source: string, edits: Parameters<typeof model.applyEdits>[0]) {
            model.applyEdits(edits);
          },
          pushUndoStop() {},
          updateOptions() {},
          dispose() {
            model.dispose();
          },
          restoreViewState() {},
          saveViewState() {
            return null;
          },
          revealLine() {},
          onDidChangeModelContent(callback: (event: { changes: Array<{ rangeOffset: number; rangeLength: number; text: string }> }) => void) {
            return model.onDidChangeContent(callback);
          },
          onDidChangeCursorPosition(callback: (event: { position: { lineNumber: number; column: number } }) => void) {
            cursorCallbacks.add(callback);
            return { dispose: () => cursorCallbacks.delete(callback) };
          },
          onDidChangeCursorSelection() {
            return { dispose() {} };
          },
          getSelection() {
            return {
              getStartPosition: () => ({ lineNumber: cursor.line + 1, column: cursor.ch + 1 }),
              getEndPosition: () => ({ lineNumber: cursor.line + 1, column: cursor.ch + 1 }),
              getDirection: () => 0
            };
          },
          setSelection() {},
          deltaDecorations() {
            return [];
          },
          layout() {}
        };
      },
      setTheme() {},
      setModelLanguage() {},
      onDidChangeMarkers() {
        return { dispose() {} };
      },
      getModelMarkers() {
        return [];
      }
    }
  };

  host.__codequestSetEditorValue = (value) => models[models.length - 1]?.setValue(value);
  host.__codequestGetEditorValue = () => models[models.length - 1]?.getValue() ?? '';
  host.__codequestSetCursor = (next) => {
    cursor = next;
    for (const callback of cursorCallbacks) callback({ position: { lineNumber: next.line + 1, column: next.ch + 1 } });
  };
}

interface CollabWindow extends Window {
  __codequestSetEditorValue(value: string): void;
  __codequestGetEditorValue(): string;
  __codequestSetCursor(cursor: { line: number; ch: number }): void;
}

function editorValue(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as unknown as CollabWindow).__codequestGetEditorValue());
}

/**
 * US8 / T152 : deux joueurs rejoignent le même document `teamId:challengeId`.
 * Leurs contributions convergent dans les deux sens et la présence du curseur
 * distant est affichée, sans dépendre d'un serveur Yjs réel.
 */
test('deux onglets convergent sur le même document collaboratif', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(installCollaborationStub);
  await context.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
  );
  await context.route('**/api/v1/challenges/*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge) })
  );

  const url = `/challenges/${CHALLENGE_ID}?teamId=${TEAM_ID}`;
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(url);
  await second.goto(url);

  await expect(first.getByTestId('collab-status')).toContainText('Édition collaborative active');
  await expect(second.getByTestId('collab-status')).toContainText('Édition collaborative active');
  await expect.poll(() => editorValue(second)).toContain('return values');

  await first.evaluate(() =>
    (window as unknown as CollabWindow).__codequestSetEditorValue('def solve(values):\n    return sorted(values)\n')
  );
  await expect.poll(() => editorValue(second)).toContain('return sorted(values)');
  await expect.poll(() => editorValue(first)).toContain('return sorted(values)');

  await first.evaluate(() =>
    (window as unknown as CollabWindow).__codequestSetCursor({ line: 1, ch: 4 })
  );
  await expect(second.getByTestId('remote-cursor')).toContainText('ligne 2');

  await second.evaluate(() =>
    (window as unknown as CollabWindow).__codequestSetEditorValue('def solve(values):\n    return list(reversed(values))\n')
  );
  await expect.poll(() => editorValue(first)).toContain('return list(reversed(values))');

  await context.close();
});
