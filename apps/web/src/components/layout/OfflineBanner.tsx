import { useEffect, useState } from 'react';
import { t } from '../../i18n';

/** T243/FR-103 : signale les actions réseau indisponibles hors ligne. */
export function OfflineBanner(): JSX.Element | null {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onOnline = (): void => setOnline(true);
    const onOffline = (): void => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div role="status" className="bg-warning px-6 py-2 text-center text-sm text-surface">
      <span>{t('offline.banner')}</span> <span>{t('offline.unavailable')}</span>
    </div>
  );
}
