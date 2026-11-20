import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { t } from '../../i18n';
import { Button, cn } from '../ui';

export interface CodeEditorProps {
  value: string;
  language: 'python' | 'javascript';
  onChange?(value: string): void;
  height?: string;
  readOnly?: boolean;
  label?: string;
  /** Document Yjs partagé (T162) : MonacoBinding synchronise le modèle et le texte. */
  sharedDoc?: Y.Doc | null;
  onCursor?(cursor: { line: number; ch: number }): void;
}

/**
 * Éditeur Monaco (T087) : coloration Python/JavaScript, thème sombre,
 * plein écran, sélection de police lisible et zone de secours sans Monaco.
 * En mode équipe, `sharedDoc` active le binding Yjs et la publication du curseur.
 */
export function CodeEditor({
  value,
  language,
  onChange,
  height = '420px',
  readOnly = false,
  label,
  sharedDoc,
  onCursor
}: CodeEditorProps): JSX.Element {
  const [fullscreen, setFullscreen] = useState(false);
  const binding = useRef<{ destroy(): void } | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      binding.current?.destroy();
      binding.current = null;
    };
  }, [sharedDoc]);

  const handleMount: OnMount = (editor, monaco) => {
    void monaco;
    const model = editor.getModel();
    if (sharedDoc && model) {
      // Chargement à la demande : Monaco n'alourdit le bundle initial que
      // lorsque le joueur rejoint réellement une session collaborative.
      void import('y-monaco').then(({ MonacoBinding }) => {
        if (!active.current) return;
        binding.current = new MonacoBinding(sharedDoc.getText('code'), model, new Set([editor]));
      });
    }
    editor.onDidChangeCursorPosition((event) => {
      onCursor?.({ line: event.position.lineNumber, ch: event.position.column - 1 });
    });
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-elevated bg-surface',
        fullscreen && 'fixed inset-0 z-50 m-0 rounded-none border-0 p-4'
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-sm text-muted">{label ?? t('editor.title')}</span>
        <Button variant="ghost" size="sm" onClick={() => setFullscreen((current) => !current)}>
          {fullscreen ? t('editor.exitFullscreen') : t('editor.fullscreen')}
        </Button>
      </div>
      <div style={{ height: fullscreen ? 'calc(100vh - 96px)' : height }}>
        <Editor
          height="100%"
          language={language === 'javascript' ? 'javascript' : 'python'}
          theme="vs-dark"
          value={value}
          onChange={(next) => onChange?.(next ?? '')}
          onMount={handleMount}
          loading={<p className="p-4 text-muted">{t('common.loading')}</p>}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: language === 'python' ? 4 : 2,
            ariaLabel: label ?? t('editor.title')
          }}
        />
      </div>
    </div>
  );
}
