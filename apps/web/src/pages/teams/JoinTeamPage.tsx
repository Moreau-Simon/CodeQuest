import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { joinTeam } from '../../services/teams';

/**
 * FR-057 : consommation d'un lien d'invitation. L'identifiant d'équipe et le
 * jeton sont tous deux nécessaires : le jeton seul ne permet pas à l'API de
 * déterminer dans quelle équipe rejoindre le joueur.
 */
export function JoinTeamPage(): ReactNode {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const teamId = params.get('teamId') ?? '';
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !token) {
      setError(t('team.joinMissing'));
      return;
    }

    let active = true;
    void joinTeam(teamId, token)
      .then((team) => {
        if (active) {
          navigate(`/teams/${team.id}`, { replace: true, state: { joined: true } });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof ApiError ? cause.message : t('common.error'));
        }
      });
    return () => {
      active = false;
    };
  }, [teamId, token, navigate]);

  if (error) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('team.joinTitle')}</h1>
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
        <Button className="mt-4" onClick={() => navigate('/teams')}>
          {t('team.back')}
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{t('team.joinTitle')}</h1>
      <Skeleton label={t('common.loading')} className="mt-4 h-24 w-full" />
    </section>
  );
}
