import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AssetViewer } from '../../components/challenges/AssetViewer';
import { Button, Field, Input } from '../../components/ui';
import { t } from '../../i18n';
import { selectIsAuthenticated, useSessionStore } from '../../stores/session';
import {
  generateAsset,
  verifyAsset,
  type AssetVerification,
  type AssetView,
  type GenerateAssetInput
} from '../../services/assets';
import { getChallenge } from '../../services/challenges';

interface Workshop {
  asset: AssetView;
  message: string;
}

/**
 * T215 [US13] Défi de stéganographie : visionneuse zoomable, soumission du
 * message retrouvé et atelier inverse. Aucune graine ni valeur attendue n'est
 * rendue au navigateur : tout passe par le relais `/assets`.
 */
export function StegoChallengePage(): JSX.Element {
  const { challengeId = '' } = useParams();
  const authenticated = useSessionStore(selectIsAuthenticated);
  const user = useSessionStore((state) => state.user);
  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: ({ signal }) => getChallenge(challengeId, signal),
    enabled: Boolean(challengeId)
  });

  const [asset, setAsset] = useState<AssetView | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AssetVerification | null>(null);
  const [workshopMessage, setWorkshopMessage] = useState('');
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [workshopResult, setWorkshopResult] = useState<AssetVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseInput = (): GenerateAssetInput => ({
    challengeId,
    challengeVersion: challenge?.currentVersion ?? 1,
    kind: 'steganography',
    subject: { type: 'player', id: user?.id ?? '' }
  });

  useEffect(() => {
    if (!challenge || !authenticated || !user) return;
    let cancelled = false;
    setError(null);
    generateAsset(baseInput())
      .then((generated) => {
        if (!cancelled) setAsset(generated);
      })
      .catch(() => {
        if (!cancelled) setError(t('asset.error'));
      });
    return () => {
      cancelled = true;
    };
    // La génération dépend uniquement de l'identité de l'instance.
  }, [challenge?.id, challenge?.currentVersion, authenticated, user?.id]);

  const verify = useMutation({
    mutationFn: () => verifyAsset(baseInput(), { assetId: asset?.assetId, text: answer }),
    onSuccess: setResult
  });

  const hide = useMutation({
    mutationFn: () => generateAsset({ ...baseInput(), payload: workshopMessage }),
    onSuccess: (generated) => setWorkshop({ asset: generated, message: workshopMessage })
  });

  const verifyWorkshop = useMutation({
    mutationFn: () =>
      verifyAsset(baseInput(), {
        assetId: workshop?.asset.assetId,
        text: workshop?.message
      }),
    onSuccess: setWorkshopResult
  });

  if (isLoading || !challenge) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <AssetViewer src={null} alt="" loading />
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/challenges" className="text-sm">
          {t('challenge.backToList')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{challenge.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('challenge.type.steganography')} ·{' '}
          {t('challenge.difficulty', { value: challenge.difficulty })}
        </p>
        <p className="mt-3 whitespace-pre-wrap">{challenge.statement}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <h2 className="text-xl font-semibold">{t('stego.viewerTitle')}</h2>
        <AssetViewer src={asset?.url ?? null} alt={t('stego.imageAlt')} loading={!asset} />
        <Field id="stego-answer" label={t('stego.answerLabel')}>
          {(aria) => (
            <Input
              {...aria}
              value={answer}
              maxLength={4096}
              onChange={(event) => setAnswer(event.target.value)}
            />
          )}
        </Field>
        <Button
          onClick={() => verify.mutate()}
          loading={verify.isPending}
          disabled={!asset || !answer || !authenticated}
        >
          {t('stego.verify')}
        </Button>
        {result ? (
          <p role="status" className={result.correct ? 'text-success' : 'text-danger'}>
            {result.correct ? t('stego.success') : t('stego.failure')}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <h2 className="text-xl font-semibold">{t('stego.workshopTitle')}</h2>
        <p className="text-sm text-muted">{t('stego.workshopHelp')}</p>
        <Field id="stego-hide-message" label={t('stego.messageToHide')}>
          {(aria) => (
            <Input
              {...aria}
              value={workshopMessage}
              maxLength={2048}
              onChange={(event) => setWorkshopMessage(event.target.value)}
            />
          )}
        </Field>
        <Button
          onClick={() => hide.mutate()}
          loading={hide.isPending}
          disabled={!workshopMessage || !authenticated}
        >
          {t('stego.hide')}
        </Button>
        {workshop ? (
          <div className="flex flex-col gap-3">
            <AssetViewer src={workshop.asset.url} alt={t('stego.workshopImageAlt')} />
            <Button
              onClick={() => verifyWorkshop.mutate()}
              loading={verifyWorkshop.isPending}
              disabled={!authenticated}
            >
              {t('stego.verifyWorkshop')}
            </Button>
            {workshopResult ? (
              <p role="status" className={workshopResult.correct ? 'text-success' : 'text-danger'}>
                {workshopResult.correct ? t('stego.workshopSuccess') : t('stego.workshopFailure')}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
