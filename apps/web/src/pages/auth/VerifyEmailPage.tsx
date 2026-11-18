import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n';
import { verifyEmail } from '../../services/auth';
import { Skeleton } from '../../components/ui';

/** Confirmation d'adresse e-mail (T061) : le jeton est consommé au montage. */
export function VerifyEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'success' | 'failure'>(
    token ? 'pending' : 'failure'
  );

  useEffect(() => {
    if (!token) return;
    let active = true;

    verifyEmail(token)
      .then(() => {
        if (active) setState('success');
      })
      .catch(() => {
        if (active) setState('failure');
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">{t('auth.verifyTitle')}</h1>

      {state === 'pending' ? (
        <>
          <p role="status">{t('auth.verifyPending')}</p>
          <Skeleton label={t('common.loading')} className="h-6 w-2/3" />
        </>
      ) : state === 'success' ? (
        <p role="status" className="rounded-xl bg-elevated p-4">
          {t('auth.verifySuccess')}
        </p>
      ) : (
        <p role="alert" className="rounded-xl bg-elevated p-4 text-danger">
          {t('auth.verifyFailure')}
        </p>
      )}

      <Link to="/login">{t('auth.loginLink')}</Link>
    </section>
  );
}
