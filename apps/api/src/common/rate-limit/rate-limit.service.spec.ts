import { RateLimitService } from './rate-limit.service';
import type { RedisLike } from './rate-limit.types';

describe('RateLimitService', () => {
  function fakeRedis(result: [number, number, number]) {
    const evalMock = jest.fn().mockResolvedValue(result);
    return { redis: { eval: evalMock } as unknown as RedisLike, evalMock };
  }

  it('autorise une requête sous la limite', async () => {
    const { redis, evalMock } = fakeRedis([1, 3, 0]);
    const service = new RateLimitService(redis);

    const result = await service.consume('rl:test', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(evalMock).toHaveBeenCalledTimes(1);
    const [script, keys, ...args] = evalMock.mock.calls[0]!;
    expect(script).toContain('ZREMRANGEBYSCORE');
    expect(keys).toBe(1);
    expect(args.slice(1, 4).map(Number)).toEqual([expect.any(Number), 60_000, 5]);
  });

  it('refuse au-delà de la limite et expose le délai de réessai', async () => {
    const { redis } = fakeRedis([0, 5, 42]);
    const service = new RateLimitService(redis);

    const result = await service.consume('rl:test', 5, 60);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(42);
  });

  it('construit des clés distinctes par portée et par sujet', () => {
    const service = new RateLimitService({ eval: jest.fn() } as unknown as RedisLike);
    expect(service.keyFor('ip', '203.0.113.0/24', '/auth/login')).toBe(
      'rl:ip:203.0.113.0/24:/auth/login'
    );
    expect(service.keyFor('account', 'user-1', '/auth/login')).toBe(
      'rl:account:user-1:/auth/login'
    );
  });

  it('normalise une réponse Redis inattendue en refus sûr', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(null) } as unknown as RedisLike;
    const service = new RateLimitService(redis);
    const result = await service.consume('rl:test', 5, 60);
    expect(result.allowed).toBe(false);
  });
});
