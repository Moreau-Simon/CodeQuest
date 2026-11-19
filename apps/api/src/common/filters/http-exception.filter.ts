import {
  Injectable,
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { logger as defaultLogger, type Logger } from '../logging/logger';

interface ErrorBody {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE'
};

/**
 * Filtre global : toutes les erreurs sortent au format `{ code, message, details }`
 * défini par `contracts/openapi.yaml` (T026). Les erreurs internes ne divulguent
 * jamais leur message d'origine (principe II).
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger = defaultLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();
    const requestId = request?.requestId;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = DEFAULT_CODES[status] ?? `HTTP_${status}`;

      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const parsed = body as ErrorBody;
        if (typeof parsed.code === 'string') code = parsed.code;

        if (Array.isArray(parsed.message)) {
          code = status === HttpStatus.BAD_REQUEST ? 'VALIDATION_ERROR' : code;
          message = status === HttpStatus.BAD_REQUEST ? 'Requête invalide' : exception.message;
          details.errors = parsed.message;
        } else if (typeof parsed.message === 'string') {
          message = parsed.message;
        }

        if (
          parsed.details &&
          typeof parsed.details === 'object' &&
          !Array.isArray(parsed.details)
        ) {
          details = { ...(parsed.details as Record<string, unknown>) };
        }
      }
    }

    const logPayload = {
      code,
      status,
      requestId,
      method: request?.method,
      url: request?.url,
      err: exception instanceof Error ? exception : undefined
    };
    if (status >= 500) {
      this.logger.error(logPayload, 'requête en échec (interne)');
    } else {
      this.logger.warn(logPayload, 'requête refusée');
    }

    response.status(status).json({
      code,
      message,
      details: requestId ? { ...details, requestId } : details
    });
  }
}
