import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AssetViewer } from '../../components/challenges/AssetViewer';
import { Button, Field, Input } from '../../components/ui';
import { t } from '../../i18n';
import {
  generateAsset,
  verifyAsset,
  type AssetVerification,
  type AssetView,
  type AssetQrStyle,
  type GenerateAssetInput
} from '../../services/assets';
import { getChallenge } from '../../services/challenges';
import { selectIsAuthenticated, useSessionStore } from '../../stores/session';

const QR_STYLE: AssetQrStyle = {
  fragments: 4,
  rotationDeg: 7,
  noiseLevel: 0.15,
  overlay: true
};

/** T215 [US13] Défi QR : visionneuse zoomable et validation du contenu décodé. */
export function QrChallengePage(): JSX.Element {
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
  const [error, setError] = useState<string | null>(null);

  const baseInput = (): GenerateAssetInput => ({
    challengeId,
    challengeVersion: challenge?.currentVersion ?? 1,
    kind: 'qr_code',
    subject: { type: 'player', id: user?.id ?? '' },
    qrStyle: QR_STYLE
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

  if (isLoading || !challenge) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <AssetViewer src={null} alt="" loading />
      </section>
    );
  }

  const matched = result?.partial.matchedFragments ?? QR_STYLE.fragments ?? 1;
  const total = result?.partial.totalFragments ?? QR_STYLE.fragments ?? 1;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/challenges" className="text-sm">
          {t('challenge.backToList')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{challenge.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('challenge.type.qr_code')} ·{' '}
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
        <h2 className="text-xl font-semibold">{t('qr.viewerTitle')}</h2>
        <AssetViewer src={asset?.url ?? null} alt={t('qr.imageAlt')} loading={!asset} />
        <p role="status" className="text-sm text-muted">
          {t('qr.fragments', { matched, total })}
        </p>
        <Field id="qr-answer" label={t('qr.answerLabel')}>
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
          {t('qr.verify')}
        </Button>
        {result ? (
          <p role="status" className={result.correct ? 'text-success' : 'text-danger'}>
            {result.correct ? t('qr.success') : t('qr.failure')}
          </p>
        ) : null}
      </section>
    </section>
  );
}
