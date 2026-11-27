import { t } from '../../i18n';

/** Symboles utiles au code sur écran tactile (T245/FR-105). */
export const SYMBOLS = [
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ':',
  '=',
  '+',
  '-',
  '*',
  '/',
  '#',
  '_',
  "'",
  '"'
] as const;

export interface SymbolTarget {
  getSelection(): {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
  executeEdits(
    source: string,
    edits: Array<{ range: unknown; text: string; forceMoveMarkers: boolean }>
  ): void;
  focus(): void;
}

export function insertSymbol(editor: SymbolTarget, symbol: string): void {
  const selection = editor.getSelection();
  if (!selection) return;
  editor.executeEdits('symbol-keyboard', [
    { range: selection, text: symbol, forceMoveMarkers: true }
  ]);
  editor.focus();
}

export function SymbolKeyboard({ onInsert }: { onInsert(symbol: string): void }): JSX.Element {
  return (
    <div role="group" aria-label={t('editor.symbols')} className="flex flex-wrap gap-1 px-3 pb-3">
      {SYMBOLS.map((symbol) => (
        <button
          key={symbol}
          type="button"
          aria-label={t('editor.insertSymbol', { symbol })}
          onClick={() => onInsert(symbol)}
          className="cq-touch-target min-w-11 rounded-md border border-line bg-elevated px-2 font-mono text-ink"
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
