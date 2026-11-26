import { useState } from 'react';
import { t } from '../../i18n';
import { Button, Skeleton } from '../ui';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3;

/**
 * Visionneuse partagée des défis US13 (T215) : zoom accessible, sans jamais
 * exposer la graine ni l'URL signée dans le DOM (seule l'URL courte est rendue).
 */
export function AssetViewer({
  src,
  alt,
  loading = false
}: {
  src: string | null;
  alt: string;
  loading?: boolean;
}): JSX.Element {
  const [zoom, setZoom] = useState(1);

  if (loading || !src) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="asset-viewer"
        className="flex max-h-[32rem] justify-center overflow-auto rounded-xl bg-elevated p-2"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
      >
        <img src={src} alt={alt} className="max-h-[30rem] max-w-full object-contain" />
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          aria-label={t('asset.zoomOut')}
          variant="secondary"
          size="sm"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
        >
          −
        </Button>
        <span className="min-w-14 text-center text-sm text-muted">{Math.round(zoom * 100)} %</span>
        <Button
          aria-label={t('asset.zoomIn')}
          variant="secondary"
          size="sm"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
        >
          +
        </Button>
      </div>
    </div>
  );
}
