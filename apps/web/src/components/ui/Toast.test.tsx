import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast, ToastViewport, useToasts } from './Toast';

describe('Toast', () => {
  it('annonce une erreur immédiatement et un succès poliment', () => {
    const { rerender } = render(
      <Toast id="1" title="Échec" description="Réessayez" tone="error" onDismiss={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Échec');
    expect(screen.getByRole('alert')).toHaveTextContent('Réessayez');

    rerender(<Toast id="1" title="Enregistré" tone="success" onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré');
  });

  it('expose un bouton de fermeture nommé', () => {
    const onDismiss = vi.fn();
    render(<Toast id="42" title="Défi résolu" onDismiss={onDismiss} />);

    const close = screen.getByRole('button', { name: 'Fermer : Défi résolu' });
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledWith('42');
  });

  it('empile les notifications dans une région nommée', () => {
    render(
      <ToastViewport
        toasts={[
          { id: '1', title: 'Un', tone: 'info' },
          { id: '2', title: 'Deux', tone: 'error' }
        ]}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Un');
    expect(screen.getByRole('alert')).toHaveTextContent('Deux');
  });
});

describe('useToasts', () => {
  it('ajoute puis retire une notification', () => {
    const { result } = renderHook(() => useToasts());

    let id = '';
    act(() => {
      id = result.current.push({ title: 'Message', tone: 'info' });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => result.current.dismiss(id));
    expect(result.current.toasts).toHaveLength(0);
  });
});
