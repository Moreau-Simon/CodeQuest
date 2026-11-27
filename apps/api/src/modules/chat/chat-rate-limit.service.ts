import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';

/** FR-093 : limites resserrées du chat (5 messages / 10 s par compte et par IP). */
export const CHAT_MESSAGE_LIMIT = 5;
export const CHAT_WINDOW_SECONDS = 10;
export const CHAT_TYPING_COOLDOWN_MS = 2_000;

export class ChatRateLimitedError extends Error {
  readonly code = 'RATE_LIMITED';

  constructor(
    readonly retryAfterMs: number,
    readonly scope: 'account' | 'address' | 'typing'
  ) {
    super(`Limite de débit chat atteinte (${scope})`);
  }
}

/** Adresse réseau tronquée au /24 (préfixe, jamais l'adresse complète). */
export function ipPrefix(address: string): string {
  const ipv4 = address.replace(/^::ffff:/, '');
  const parts = ipv4.split(':')[0]?.split('.');
  if (parts?.length === 4) return parts.slice(0, 3).join('.');
  return ipv4.split(':').slice(0, 3).join(':') || 'unknown';
}

/**
 * T231 (FR-093) : fenêtre glissante Redis par compte et par préfixe d'adresse.
 *
 * `chat.typing` reste éphémère : aucun événement n'est persisté, la cadence est
 * vérifiée dans un registre local sur l'horloge serveur injectée.
 */
@Injectable()
export class ChatRateLimitService {
  private readonly lastTyping = new Map<string, number>();

  constructor(
    private readonly limiter: RateLimitService,
    private readonly clock: Clock
  ) {}

  async assertCanSend(userId: string, address: string): Promise<void> {
    const account = await this.limiter.consume(
      this.limiter.keyFor('account', userId, 'chat.send'),
      CHAT_MESSAGE_LIMIT,
      CHAT_WINDOW_SECONDS
    );
    if (!account.allowed) {
      throw new ChatRateLimitedError(Math.max(1, account.retryAfterSeconds * 1_000), 'account');
    }

    const network = await this.limiter.consume(
      this.limiter.keyFor('ip', ipPrefix(address), 'chat.send'),
      CHAT_MESSAGE_LIMIT,
      CHAT_WINDOW_SECONDS
    );
    if (!network.allowed) {
      throw new ChatRateLimitedError(Math.max(1, network.retryAfterSeconds * 1_000), 'address');
    }
  }

  assertCanType(userId: string): void {
    const now = this.clock.nowMs();
    const previous = this.lastTyping.get(userId);
    if (previous !== undefined && now - previous < CHAT_TYPING_COOLDOWN_MS) {
      throw new ChatRateLimitedError(CHAT_TYPING_COOLDOWN_MS - (now - previous), 'typing');
    }
    this.lastTyping.set(userId, now);
  }
}
