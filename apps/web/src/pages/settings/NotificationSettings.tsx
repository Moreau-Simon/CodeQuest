import { useState } from 'react';
import { Button } from '../../components/ui';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { t } from '../../i18n';

/** T244 / FR-104 : consentement explicite aux notifications Web Push. */
export function NotificationSettings(): JSX.Element {
  const { status, enable, disable } = usePushNotifications();
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-elevated p-4">
      <h2 className="text-xl font-semibold">{t('push.title')}</h2>
      {status === 'unsupported' ? (
        <p className="text-sm text-muted">{t('push.unsupported')}</p>
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            {status === 'enabled'
              ? t('push.enabled')
              : status === 'declined'
                ? t('push.declined')
                : t('push.enableHint')}
          </p>
          {status === 'enabled' ? (
            <Button
              type="button"
              variant="secondary"
              loading={busy}
              className="w-fit"
              onClick={() => void act(disable)}
            >
              {t('push.disable')}
            </Button>
          ) : (
            <Button
              type="button"
              loading={busy}
              disabled={status === 'declined'}
              className="w-fit"
              onClick={() => void act(enable)}
            >
              {t('push.enable')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
