import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api-client';

/** T244 / FR-104 : état du consentement aux notifications Web Push. */
export type PushStatus = 'unsupported' | 'default' | 'enabled' | 'declined';

interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/**
 * Abonne le navigateur après **autorisation explicite** et transmet la clé
 * publique du abonnement à l'API. Aucune notification n'est demandée tant que
 * le joueur n'a pas activé la préférence.
 */
export function usePushNotifications(): {
  status: PushStatus;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [status, setStatus] = useState<PushStatus>('unsupported');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    api
      .get<{ publicKey: string }>('/notifications/vapid-public-key')
      .then(async (result) => {
        if (!mounted) return;
        const key = result.publicKey || null;
        setPublicKey(key);
        if (!key) return;

        // Un abonnement déjà accordé doit être récupéré : sinon l'interface
        // afficherait « activé » sans pouvoir le révoquer après rechargement.
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!mounted) return;
        if (existing) setSubscription(existing);
        setStatus(
          Notification.permission === 'granted'
            ? 'enabled'
            : Notification.permission === 'denied'
              ? 'declined'
              : 'default'
        );
      })
      .catch(() => {
        if (mounted) setStatus('unsupported');
      });

    return () => {
      mounted = false;
    };
  }, []);

  const enable = useCallback(async (): Promise<void> => {
    if (!publicKey || !('Notification' in window) || !('serviceWorker' in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('declined');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const active = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    const keys = active.toJSON().keys;
    const payload: PushSubscriptionPayload = {
      endpoint: active.endpoint,
      keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' }
    };
    await api.post('/notifications/subscriptions', payload);
    setSubscription(active);
    setStatus('enabled');
  }, [publicKey]);

  const disable = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    await subscription.unsubscribe();
    await api.delete(
      `/notifications/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`
    );
    setSubscription(null);
    setStatus('default');
  }, [subscription]);

  return { status, enable, disable };
}
