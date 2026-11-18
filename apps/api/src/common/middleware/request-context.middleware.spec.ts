import { ipPrefixOf, RequestContextMiddleware, requestStore } from './request-context.middleware';
import type { NextFunction, Request, Response } from 'express';

describe('ipPrefixOf', () => {
  it('conserve un /24 pour IPv4 (minimisation RGPD)', () => {
    expect(ipPrefixOf('203.0.113.42')).toBe('203.0.113.0/24');
    expect(ipPrefixOf('10.1.2.3')).toBe('10.1.2.0/24');
  });

  it('gère les IPv4 mappées en IPv6', () => {
    expect(ipPrefixOf('::ffff:203.0.113.42')).toBe('203.0.113.0/24');
  });

  it('conserve un /48 pour IPv6', () => {
    expect(ipPrefixOf('2001:db8:abcd:12:34:56:78:9a')).toBe('2001:db8:abcd::/48');
    expect(ipPrefixOf('::1')).toBe('::/48');
  });

  it('retourne null pour une adresse inconnue ou invalide', () => {
    expect(ipPrefixOf(undefined)).toBeNull();
    expect(ipPrefixOf('')).toBeNull();
    expect(ipPrefixOf('pas-une-ip')).toBeNull();
  });
});

describe('RequestContextMiddleware', () => {
  const middleware = new RequestContextMiddleware();

  function fakeExchange(headers: Record<string, string> = {}, ip = '203.0.113.42') {
    const req = { headers, ip, socket: { remoteAddress: ip } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next: NextFunction = jest.fn();
    return { req, res, next };
  }

  it('génère un requestId UUIDv7 et le renvoie dans X-Request-Id', () => {
    const { req, res, next } = fakeExchange();
    middleware.use(req, res, next);

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(req.ipPrefix).toBe('203.0.113.0/24');
    expect(next).toHaveBeenCalled();
  });

  it('réutilise un X-Request-Id amont valide', () => {
    const { req, res, next } = fakeExchange({ 'x-request-id': 'amont-123' });
    middleware.use(req, res, next);
    expect(req.requestId).toBe('amont-123');
  });

  it('expose le contexte via AsyncLocalStorage pendant la requête', () => {
    const { req, res } = fakeExchange();
    let seen: { requestId?: string; ipPrefix?: string | null } | undefined;
    middleware.use(req, res, () => {
      seen = requestStore.getStore();
    });
    expect(seen?.requestId).toBe(req.requestId);
    expect(seen?.ipPrefix).toBe('203.0.113.0/24');
  });
});
