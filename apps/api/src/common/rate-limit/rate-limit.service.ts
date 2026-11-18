import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../uuid';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RateLimitResult, RedisLike } from './rate-limit.types';

/**
 * Fenêtre glissante atomique sur Redis (T037).
 *
 * Le script Lua supprime les entrées hors fenêtre, compte, puis ajoute
 * l'entrée courante. Tout est atomique : deux instances d'API ne peuvent pas
 * dépasser la limite simultanément.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 0
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
    if retry < 1 then retry = 1 end
  end
  return {0, count, retry}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
`;

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisLike) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = Math.max(1, Math.round(windowSeconds * 1000));

    let raw: unknown;
    try {
      raw = await this.redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        now,
        windowMs,
        limit,
        `${now}:${uuidv7()}`
      );
    } catch {
      // Refus sûr : en cas d'indisponibilité de Redis, on ne laisse pas passer
      // un trafic non limité sur les routes sensibles.
      return { allowed: false, remaining: 0, retryAfterSeconds: 5 };
    }

    if (!Array.isArray(raw) || raw.length < 3) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 5 };
    }

    const [allowedRaw, countRaw, retryRaw] = raw as [unknown, unknown, unknown];
    const allowed = Number(allowedRaw) === 1;
    const count = Number(countRaw);
    const retryAfterSeconds = Number(retryRaw);

    return {
      allowed,
      remaining: allowed ? Math.max(0, limit - count) : 0,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds) : 0
    };
  }

  keyFor(scope: 'ip' | 'account', subject: string, route: string): string {
    return `rl:${scope}:${subject}:${route}`;
  }
}
