import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { ChallengeHint, ChallengeType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';

const EXPLORATORY_TYPES: readonly ChallengeType[] = [
  'debugging',
  'decryption',
  'steganography',
  'qr_code'
];

export interface AllowedHint {
  readonly hint: ChallengeHint;
  readonly challengeId: string;
  readonly challengeType: ChallengeType;
}

/**
 * Règles d'achat des indices (T193, FR-042/FR-074/FR-075, clarification 5).
 *
 * Un indice est réservé aux défis exploratoires, au mode solo, hors event
 * ouvert et hors rencontre de boss. Le déverrouillage est strictement
 * progressif ; le contenu n'est jamais dérivé des tests chiffrés.
 */
@Injectable()
export class HintPolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  async assertAllowed(
    user: AuthenticatedUser,
    hintId: string,
    teamId?: string
  ): Promise<AllowedHint> {
    if (user.status === 'pending') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour acheter un indice'
      });
    }
    if (teamId) {
      throw new ConflictException({
        code: 'HINT_SOLO_ONLY',
        message: 'Les indices ne sont disponibles qu’en solo'
      });
    }

    const hint = await this.prisma.challengeHint.findUnique({
      where: { id: hintId },
      include: { challenge: { select: { type: true } } }
    });
    if (!hint) {
      throw new NotFoundException({ code: 'HINT_NOT_FOUND', message: 'Indice introuvable' });
    }
    if (!EXPLORATORY_TYPES.includes(hint.challenge.type)) {
      throw new ConflictException({
        code: 'HINT_NOT_ALLOWED',
        message: 'Aucun indice n’est disponible pour ce type de défi'
      });
    }

    const now = this.clock.now();
    const openEvent = await this.prisma.eventParticipant.findFirst({
      where: {
        subjectType: 'player',
        subjectId: user.id,
        event: { status: 'open', startsAt: { lte: now }, endsAt: { gte: now } }
      },
      select: { eventId: true }
    });
    if (openEvent) {
      throw new ConflictException({
        code: 'HINT_DURING_EVENT',
        message: 'Les indices sont désactivés pendant un événement'
      });
    }

    const bossFight = await this.prisma.bossEngagement.findFirst({
      where: { subjectType: 'player', subjectId: user.id, defeatedAt: null },
      select: { id: true }
    });
    if (bossFight) {
      throw new ConflictException({
        code: 'HINT_DURING_BOSS',
        message: 'Les indices sont désactivés pendant une rencontre de boss'
      });
    }

    const purchased = await this.prisma.hintPurchase.findMany({
      where: { userId: user.id, challengeId: hint.challengeId },
      select: { hintId: true }
    });
    const purchasedIds = new Set(purchased.map((row) => row.hintId));
    if (purchasedIds.has(hint.id)) {
      throw new ConflictException({
        code: 'HINT_ALREADY_PURCHASED',
        message: 'Cet indice a déjà été acheté'
      });
    }

    const ordered = await this.prisma.challengeHint.findMany({
      where: { challengeId: hint.challengeId },
      orderBy: { order: 'asc' },
      select: { id: true }
    });
    const index = ordered.findIndex((row) => row.id === hint.id);
    const previous = index > 0 ? ordered[index - 1] : undefined;
    if (previous && !purchasedIds.has(previous.id)) {
      throw new ConflictException({
        code: 'HINT_LOCKED',
        message: 'Achetez d’abord l’indice précédent'
      });
    }

    return { hint, challengeId: hint.challengeId, challengeType: hint.challenge.type };
  }
}
