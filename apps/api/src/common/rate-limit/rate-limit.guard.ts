import {
  HttpException,
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitScope } from './rate-limit.types';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  scope: RateLimitScope;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  limit: 300,
  windowSeconds: 60,
  scope: 'ip'
};

/**
 * Limitation de débit globale adossée à Redis (T037) : fenêtre glissante par
 * compte et/ou préfixe IP. Les routes sensibles (authentification, achats)
 * déclarent une limite plus stricte via `@RateLimit(...)`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    private readonly metrics: MetricsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const overrides = this.reflector.getAllAndOverride<Partial<RateLimitOptions>>(
      RATE_LIMIT_KEY,
      targets
    );
    const options: RateLimitOptions = { ...DEFAULT_OPTIONS, ...overrides };
    if (options.limit <= 0) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const route = `${request.method} ${request.route?.path ?? request.path ?? 'unknown'}`;

    const subjects: Array<{ scope: 'ip' | 'account'; subject: string }> = [];
    if (options.scope === 'ip' || options.scope === 'both') {
      subjects.push({ scope: 'ip', subject: request.ipPrefix ?? 'unknown' });
    }
    if (options.scope === 'account' || options.scope === 'both') {
      subjects.push({
        scope: 'account',
        subject: request.user?.id ?? request.ipPrefix ?? 'unknown'
      });
    }

    for (const { scope, subject } of subjects) {
      const result = await this.rateLimit.consume(
        this.rateLimit.keyFor(scope, subject, route),
        options.limit,
        options.windowSeconds
      );

      response.setHeader('X-RateLimit-Limit', options.limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('X-RateLimit-Reset', result.retryAfterSeconds);

      if (!result.allowed) {
        this.metrics.countRateLimitHit(scope);
        response.setHeader('Retry-After', result.retryAfterSeconds);
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: 'Trop de requêtes, réessayez plus tard',
            details: { retryAfterSeconds: result.retryAfterSeconds, scope }
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    return true;
  }
}
