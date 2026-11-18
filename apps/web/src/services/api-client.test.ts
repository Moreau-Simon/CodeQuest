import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiRequest } from './api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('envoie les cookies de session et les en-têtes JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'user-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get<{ id: string }>('/me')).resolves.toEqual({ id: 'user-1' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/me');
    expect(init).toMatchObject({ credentials: 'include', method: 'GET' });
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
  });

  it('sérialise le corps JSON et transmet la clé d’idempotence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/economy/purchase', { itemId: 'hint-1' }, { idempotencyKey: 'uuid-1' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBe('{"itemId":"hint-1"}');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('uuid-1');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it("convertit l'enveloppe d'erreur en ApiError", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { code: 'CHALLENGE_LOCKED', message: 'Défi verrouillé', details: { level: 3 } },
            403
          )
        )
    );

    const error = await api.get('/challenges/1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'CHALLENGE_LOCKED',
      message: 'Défi verrouillé',
      details: { level: 3 }
    });
  });

  it('fabrique une erreur générique si le serveur ne renvoie pas d’enveloppe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));

    await expect(apiRequest('/me')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR'
    });
  });

  it('renvoie undefined pour une réponse 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.delete('/me/sessions')).resolves.toBeUndefined();
  });
});
