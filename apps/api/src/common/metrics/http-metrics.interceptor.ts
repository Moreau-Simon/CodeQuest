import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Mesure la latence HTTP par route normalisée (T028). */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const route = request.route?.path ?? request.path ?? 'unmatched';

    response.once('finish', () => {
      this.metrics.observeHttp(
        request.method,
        route,
        response.statusCode,
        (performance.now() - startedAt) / 1000
      );
    });

    return next.handle();
  }
}
