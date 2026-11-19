import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('est un bouton de type button par défaut', () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole('button', { name: 'Valider' })).toHaveAttribute('type', 'button');
  });

  it('déclenche l’action au clic et au clavier (bouton natif)', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Envoyer</Button>);
    const button = screen.getByRole('button', { name: 'Envoyer' });

    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('annonce le chargement et empêche les doubles soumissions', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Enregistrer' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respecte un type explicite (soumission de formulaire)', () => {
    render(<Button type="submit">Connexion</Button>);
    expect(screen.getByRole('button', { name: 'Connexion' })).toHaveAttribute('type', 'submit');
  });
});
