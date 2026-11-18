import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { logger } from './common/logging/logger';
import { env } from './config/env';

/**
 * Configuration HTTP commune à `main.ts` et aux tests (contrat, intégration).
 *
 * Extraite pour que les tests exercent exactement le même pipeline que la
 * production : préfixe `/api`, cookies signés, contexte de requête, CSP,
 * limite de corps et proxy.
 */
export function configureApp(app: NestExpressApplication): void {
  // Routes opérationnelles hors préfixe versionné.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET }
    ]
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: env.NODE_ENV === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc:
            env.NODE_ENV === 'production'
              ? ["'self'", 'wss:']
              : ["'self'", 'ws:', 'http://localhost:*', 'http://127.0.0.1:*'],
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' }
    })
  );

  app.use(cookieParser(env.SESSION_SECRET));
  app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()));
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => (request as Request).requestId,
      customProps: (request) => ({
        requestId: (request as Request).requestId,
        ipPrefix: (request as Request).ipPrefix
      }),
      autoLogging: {
        ignore: (request) => request.url === '/health' || request.url === '/metrics'
      }
    }) as unknown as (req: Request, res: Response, next: NextFunction) => void
  );

  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  });
  app.useBodyParser('json', { limit: '512kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false
    })
  );
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Derrière nginx : faire confiance au proxy pour les IP et le protocole.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
}
