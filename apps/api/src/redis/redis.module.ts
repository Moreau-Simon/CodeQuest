import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';
import { BULLMQ_CONNECTION, REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import type { ConnectionOptions } from 'bullmq';

/** Connexion BullMQ sans `keyPrefix` : BullMQ gère son propre préfixe. */
export function bullmqConnectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    maxRetriesPerRequest: null
  };
}

function createClient(prefix?: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    keyPrefix: prefix,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false
  });
  client.on('error', (error) => {
    // pino est branché plus tard : éviter une boucle de log ioredis.
    if (process.env.NODE_ENV !== 'test') {
      console.error('redis: erreur de connexion', error.message);
    }
  });
  return client;
}

/** Clients Redis de l'API : cache/limitation (préfixés) et pub/sub (non préfixés). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = createClient(`${env.REDIS_PREFIX}:`);
  readonly subscriber = createClient();
  readonly bullmq = bullmqConnectionFromUrl(env.REDIS_URL);

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      useFactory: (service: RedisService) => service.client,
      inject: [RedisService]
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (service: RedisService) => service.subscriber,
      inject: [RedisService]
    },
    {
      provide: BULLMQ_CONNECTION,
      useFactory: (service: RedisService) => service.bullmq,
      inject: [RedisService]
    }
  ],
  exports: [RedisService, REDIS_CLIENT, REDIS_SUBSCRIBER, BULLMQ_CONNECTION]
})
export class RedisModule {}
