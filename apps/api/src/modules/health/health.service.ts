import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { STORAGE_SERVICE, type StorageHealth } from '../../storage/storage.constants';

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs: number;
  detail?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checkedAt: string;
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    minio: DependencyCheck;
  };
}

interface RedisPing {
  ping(): Promise<string>;
}

/**
 * Santé de l'API (T029) : liveness sans dépendance externe, readiness avec
 * PostgreSQL, Redis et MinIO.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisPing,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageHealth
  ) {}

  liveness(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis, minio] = await Promise.all([
      this.check('postgres', () => this.prisma.$executeRawUnsafe('SELECT 1')),
      this.check('redis', () => this.redis.ping()),
      this.check('minio', () => this.storage.checkHealth())
    ]);

    const checks = { postgres, redis, minio };
    const ready = Object.values(checks).every((check) => check.status === 'up');

    return {
      status: ready ? 'ready' : 'not_ready',
      checkedAt: new Date().toISOString(),
      checks
    };
  }

  private async check(name: string, probe: () => Promise<unknown>): Promise<DependencyCheck> {
    const startedAt = performance.now();
    try {
      await probe();
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        detail: error instanceof Error ? `${name}: ${error.name}` : `${name}: erreur`
      };
    }
  }
}
