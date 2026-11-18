import { SetMetadata } from '@nestjs/common';
import type { RateLimitOptions } from './rate-limit.guard';

export const RATE_LIMIT_KEY = 'cq:rateLimit';

/**
 * Limite de débit par route. Sans décorateur, la limite par défaut s'applique
 * (300 requêtes/minute par préfixe IP).
 */
export const RateLimit = (options: Partial<RateLimitOptions>): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);
