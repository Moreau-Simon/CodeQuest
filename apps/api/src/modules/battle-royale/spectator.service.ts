import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SubjectType } from '@prisma/client';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';
import type { BattleSubjectType } from './elimination.rule';

/** T222 [US14] — passage en spectateur et interdiction de soumettre (FR-099). */
@Injectable()
export class SpectatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Marque un sujet comme spectateur ; idempotent. */
  async eliminate(
    eventId: string,
    subjectType: BattleSubjectType,
    subjectId: string
  ): Promise<boolean> {
    const result = await this.prisma.eventParticipant.updateMany({
      where: {
        eventId,
        subjectType: subjectType as SubjectType,
        subjectId,
        eliminatedAt: null
      },
      data: { eliminatedAt: this.clock.now() }
    });
    return result.count > 0;
  }

  /** Porte utilisée par `AttemptService` : un éliminé ne joue plus. */
  async assertActive(
    eventId: string,
    subjectType: BattleSubjectType,
    subjectId: string
  ): Promise<void> {
    const participant = await this.prisma.eventParticipant.findUnique({
      where: {
        eventId_subjectType_subjectId: {
          eventId,
          subjectType: subjectType as SubjectType,
          subjectId
        }
      },
      select: { eliminatedAt: true }
    });
    if (participant?.eliminatedAt) {
      throw new ForbiddenException({
        code: 'PARTICIPANT_ELIMINATED',
        message: 'Vous êtes spectateur de cette battle royale'
      });
    }
  }
}
