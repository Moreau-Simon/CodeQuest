import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { register } from '../../services/auth';
import { ApiError } from '../../services/api-client';
import { Button, Field, Input } from '../../components/ui';

/** Inscription (T061) : e-mail, pseudo et mot de passe conforme à la politique. */
export function RegisterPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ email, pseudonym, password });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('auth.registerTitle')}</h1>
        <p role="status" className="rounded-xl bg-elevated p-4">
          {t('auth.registerSuccess')}
        </p>
        <Link to="/login">{t('auth.loginLink')}</Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('auth.registerTitle')}</h1>
        <p className="mt-1 text-muted">{t('auth.registerSubtitle')}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field id="register-email" label={t('auth.email')} required>
          {(aria) => (
            <Input
              {...aria}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>

        <Field
          id="register-pseudonym"
          label={t('auth.pseudonym')}
          hint={t('auth.pseudonymHint')}
          required
        >
          {(aria) => (
            <Input
              {...aria}
              autoComplete="username"
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_-]+"
              value={pseudonym}
              onChange={(event) => setPseudonym(event.target.value)}
              required
            />
          )}
        </Field>

        <Field
          id="register-password"
          label={t('auth.password')}
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
          {t('auth.submitRegister')}
        </Button>
      </form>

      <Link to="/login">{t('auth.loginLink')}</Link>
    </section>
  );
}
