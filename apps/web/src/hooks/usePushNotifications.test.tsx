import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications, type PushStatus } from './usePushNotifications';

/** T244 [P] [US16] (FR-104) : abonnement Web Push après autorisation explicite. */
const ENDPOINT = 'https://push.example.com/subscription-1';
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-secret' };
const PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9W0nC3SDH4nRkpNkqRZ8';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('usePushNotifications (T244 / FR-104)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let requestPermission: ReturnType<typeof vi.fn>;
  let subscribe: ReturnType<typeof vi.fn>;
  let getSubscription: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    unsubscribe = vi.fn().mockResolvedValue(true);
    subscribe = vi.fn().mockResolvedValue({
      endpoint: ENDPOINT,
      toJSON: () => ({ endpoint: ENDPOINT, keys: KEYS }),
      unsubscribe
    });
    getSubscription = vi.fn().mockResolvedValue(null);
    requestPermission = vi.fn().mockResolvedValue('granted');
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/notifications/vapid-public-key')) return json({ publicKey: PUBLIC_KEY });
      if (url.endsWith('/notifications/subscriptions') && init?.method === 'POST') {
        return json({ endpoint: ENDPOINT }, 201);
      }
      if (url.includes('/notifications/subscriptions') && init?.method === 'DELETE')
        return json({});
      return json({});
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('demande l’autorisation puis transmet l’abonnement à l’API', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe<PushStatus>('default'), {
      timeout: 5_000
    });

    await act(async () => {
      await result.current.enable();
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array)
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/notifications/subscriptions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ endpoint: ENDPOINT, keys: KEYS })
      })
    );
    expect(result.current.status).toBe<PushStatus>('enabled');
  });

  it('n’envoie aucun abonnement quand l’autorisation est refusée', async () => {
    requestPermission.mockResolvedValue('denied');
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe<PushStatus>('default'), {
      timeout: 5_000
    });

    await act(async () => {
      await result.current.enable();
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.status).toBe<PushStatus>('declined');
  });

  it('révoque l’abonnement à la demande du joueur', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe<PushStatus>('default'), {
      timeout: 5_000
    });
    await act(async () => {
      await result.current.enable();
    });

    await act(async () => {
      await result.current.disable();
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`endpoint=${encodeURIComponent(ENDPOINT)}`),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result.current.status).toBe<PushStatus>('default');
  });

  it('reprend un abonnement existant après rechargement pour pouvoir le révoquer', async () => {
    getSubscription.mockResolvedValue({ endpoint: ENDPOINT, unsubscribe });
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.status).toBe<PushStatus>('enabled'), {
      timeout: 5_000
    });

    await act(async () => {
      await result.current.disable();
    });

    expect(getSubscription).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`endpoint=${encodeURIComponent(ENDPOINT)}`),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
