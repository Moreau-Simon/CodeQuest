import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n';
import { resetPassword } from '../../services/auth';
import { ApiError } from '../../services/api-client';
import { Button, Field, Input } from '../../components/ui';

/** Consommation d'un lien de réinitialisation à usage unique (T061). */
export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('auth.resetTitle')}</h1>
        <p className="mt-1 text-muted">{t('auth.resetSubtitle')}</p>
      </div>

      {!token ? (
        <p role="alert" className="rounded-xl bg-elevated p-4 text-danger">
          {t('auth.verifyFailure')}
        </p>
      ) : done ? (
        <p role="status" className="rounded-xl bg-elevated p-4">
          {t('auth.resetDone')}
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Field
            id="reset-password"
            label={t('auth.newPassword')}
            hint={t('auth.passwordHint')}
            required
          >
            {(aria) => (
              <Input
                {...aria}
                type="password"
                autoComplete="new-password"
                minLength={12}
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
            {t('auth.submitReset')}
          </Button>
        </form>
      )}

      <Link to="/login">{t('auth.loginLink')}</Link>
    </section>
  );
}
