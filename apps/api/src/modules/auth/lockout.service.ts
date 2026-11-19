import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../../redis/redis.module';

/** Verrouillage progressif après 5 échecs consécutifs (T054, FR-006). */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class LockoutService {
  constructor(private readonly redis: RedisService) {}

  /** Clé opaque : l'identifiant (e-mail ou pseudo) n'est jamais stocké en clair. */
  private key(identifier: string): string {
    const digest = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
    return `auth:lock:${digest}`;
  }

  /** Verrouillé seulement au-delà du seuil, pas dès le premier échec. */
  async isLocked(identifier: string): Promise<boolean> {
    const failures = Number((await this.redis.client.get(this.key(identifier))) ?? 0);
    return Number.isFinite(failures) && failures >= MAX_FAILED_ATTEMPTS;
  }

  /** Incrémente le compteur d'échecs ; renvoie vrai au 5ᵉ échec. */
  async recordFailure(identifier: string): Promise<boolean> {
    const key = this.key(identifier);
    const failures = await this.redis.client.incr(key);

    if (failures === 1 || failures >= MAX_FAILED_ATTEMPTS) {
      await this.redis.client.expire(key, LOCKOUT_WINDOW_SECONDS);
    }
    return failures >= MAX_FAILED_ATTEMPTS;
  }

  async reset(identifier: string): Promise<void> {
    await this.redis.client.del(this.key(identifier));
  }
}
