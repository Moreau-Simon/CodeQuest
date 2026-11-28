import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { login } from '../../services/auth';
import { apiErrorMessage } from '../../services/api-client';
import { Button, Field, Input } from '../../components/ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** L'identifiant est soit un e-mail valide, soit un pseudo (pas de `@`). */
function validateInput(identifier: string, password: string): string | null {
  const value = identifier.trim();
  if (value.length === 0) return t('auth.identifierRequired');
  if (value.includes('@') && !EMAIL_PATTERN.test(value)) return t('auth.invalidEmail');
  if (password.length === 0) return t('auth.passwordRequired');
  return null;
}

/** Connexion (T061) : cookies `HttpOnly` posés par l'API, aucun jeton en JS. */
export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const invalid = validateInput(identifier, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login({ identifier, password });
      await queryClient.invalidateQueries({ queryKey: ['session', 'me'] });
      navigate('/profile');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('auth.loginTitle')}</h1>
        <p className="mt-1 text-muted">{t('auth.loginSubtitle')}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field id="login-identifier" label={t('auth.identifier')} required>
          {(aria) => (
            <Input
              {...aria}
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          )}
        </Field>

        <Field id="login-password" label={t('auth.password')} required>
          {(aria) => (
            <Input
              {...aria}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" loading={submitting} block>
          {t('auth.submitLogin')}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <Link to="/forgot-password">{t('auth.forgotLink')}</Link>
        <Link to="/register">{t('auth.registerLink')}</Link>
      </div>
    </section>
  );
}
