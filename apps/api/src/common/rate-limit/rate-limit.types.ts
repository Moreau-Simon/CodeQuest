/** Sous-ensemble d'ioredis utilisé par la limitation de débit (testable). */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export type RateLimitScope = 'ip' | 'account' | 'both';
