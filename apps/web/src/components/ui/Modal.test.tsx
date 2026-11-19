import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';

function Harness({ closeOnBackdrop = true }: { closeOnBackdrop?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmer la suppression"
        description="Cette action est irréversible."
        closeOnBackdrop={closeOnBackdrop}
        footer={<button type="button">Supprimer</button>}
      >
        <p>Contenu de la modale</p>
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('expose un dialogue modal nommé et décrit', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Confirmer la suppression');
    expect(dialog).toHaveAccessibleDescription('Cette action est irréversible.');
  });

  it('place le focus dans la modale puis le rend au déclencheur à la fermeture', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    trigger.focus();
    fireEvent.click(trigger);

    const close = screen.getByRole('button', { name: 'Fermer' });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('piège la tabulation dans le dialogue', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const close = screen.getByRole('button', { name: 'Fermer' });
    const last = screen.getByRole('button', { name: 'Supprimer' });
    await waitFor(() => expect(close).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('ne ferme pas au clic sur l’arrière-plan quand closeOnBackdrop est faux', () => {
    render(<Harness closeOnBackdrop={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
