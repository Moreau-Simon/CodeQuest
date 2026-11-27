import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { insertSymbol, SymbolKeyboard, SYMBOLS } from './SymbolKeyboard';

describe('Clavier de symboles (T245 / FR-105)', () => {
  it('insère le symbole à la position du curseur et rend le focus à l’éditeur', () => {
    const selection = { startLineNumber: 2, startColumn: 4, endLineNumber: 2, endColumn: 4 };
    const editor = {
      getSelection: () => selection,
      executeEdits: vi.fn(),
      focus: vi.fn()
    };
    insertSymbol(editor, ':');

    expect(editor.executeEdits).toHaveBeenCalledWith('symbol-keyboard', [
      { range: selection, text: ':', forceMoveMarkers: true }
    ]);
    expect(editor.focus).toHaveBeenCalledTimes(1);
  });

  it('expose des boutons nommés et activables au clavier', () => {
    const onInsert = vi.fn();
    render(<SymbolKeyboard onInsert={onInsert} />);

    const button = screen.getByRole('button', { name: 'Insérer :' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onInsert).toHaveBeenCalledWith(':');
    expect(SYMBOLS.length).toBeGreaterThan(5);
  });
});
