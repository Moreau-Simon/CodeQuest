import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, Input } from './Input';

describe('Field + Input', () => {
  it('relie le label au champ et expose l’aide via aria-describedby', () => {
    render(
      <Field id="pseudo" label="Pseudo" hint="3 à 20 caractères" required>
        {(aria) => <Input {...aria} />}
      </Field>
    );

    const input = screen.getByLabelText(/Pseudo/);
    expect(input).toHaveAttribute('id', 'pseudo');
    expect(input).toHaveAttribute('aria-describedby', 'pseudo-hint');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('3 à 20 caractères')).toHaveAttribute('id', 'pseudo-hint');
  });

  it('annonce l’erreur et marque le champ invalide', () => {
    render(
      <Field id="email" label="E-mail" hint="Jamais publié" error="Adresse invalide">
        {(aria) => <Input {...aria} type="email" />}
      </Field>
    );

    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint email-error');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Adresse invalide');
    expect(alert).toHaveAttribute('id', 'email-error');
  });

  it('transmet les propriétés natives du champ', () => {
    render(
      <Field id="password" label="Mot de passe">
        {(aria) => <Input {...aria} type="password" autoComplete="new-password" />}
      </Field>
    );

    const input = screen.getByLabelText('Mot de passe');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });
});
