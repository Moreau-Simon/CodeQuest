import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BattleRoyaleGateway } from '../../realtime/battle-royale.gateway';

/** FR-101 : sous le minimum configuré, la battle royale est reportée. */
export class NotEnoughParticipantsError extends Error {
  readonly code = 'BATTLE_NOT_ENOUGH_PARTICIPANTS';

  constructor(
    readonly minParticipants: number,
    readonly actual: number
  ) {
    super(
      `Battle royale reportée : ${actual} participant(s) pour un minimum de ${minParticipants}`
    );
  }
}

@Injectable()
export class EligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BattleRoyaleGateway
  ) {}

  /** Compte les participants encore en lice (les éliminés sont spectateurs). */
  async check(eventId: string): Promise<{ minParticipants: number; actual: number }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { minParticipants: true }
    });
    if (!event) throw new Error('Événement introuvable');

    const minParticipants = event.minParticipants || 8;
    const actual = await this.prisma.eventParticipant.count({
      where: { eventId, eliminatedAt: null }
    });
    if (actual < minParticipants) {
      const registered = await this.prisma.eventParticipant.findMany({
        where: { eventId, subjectType: 'player' },
        select: { subjectId: true }
      });
      this.gateway.postponed(
        eventId,
        registered.map((participant) => participant.subjectId)
      );
      throw new NotEnoughParticipantsError(minParticipants, actual);
    }
    return { minParticipants, actual };
  }
}
