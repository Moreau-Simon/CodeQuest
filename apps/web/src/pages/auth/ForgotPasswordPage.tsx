import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { forgotPassword } from '../../services/auth';
import { ApiError } from '../../services/api-client';
import { Button, Field, Input } from '../../components/ui';

/**
 * Demande de réinitialisation (T061). La réponse est volontairement identique
 * que l'adresse existe ou non (FR-007).
 */
export function ForgotPasswordPage(): JSX.Element {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(identifier);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('auth.forgotTitle')}</h1>
        <p className="mt-1 text-muted">{t('auth.forgotSubtitle')}</p>
      </div>

      {sent ? (
        <p role="status" className="rounded-xl bg-elevated p-4">
          {t('auth.forgotSent')}
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field id="forgot-identifier" label={t('auth.identifier')} required>
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

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={submitting} block>
            {t('auth.sendReset')}
          </Button>
        </form>
      )}

      <Link to="/login">{t('auth.loginLink')}</Link>
    </section>
  );
}
