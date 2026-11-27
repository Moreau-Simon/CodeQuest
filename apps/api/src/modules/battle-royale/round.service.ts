import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BattleRound, type SubjectType } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { BattleRoyaleGateway } from '../../realtime/battle-royale.gateway';
import type { BattleSubjectType, EliminationCandidate } from './elimination.rule';
import { EliminationService } from './elimination.service';
import { EligibilityService } from './eligibility.service';
import { SpectatorService } from './spectator.service';

export interface ScheduleRoundInput {
  challengeId: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export interface RoundView {
  id: string;
  eventId: string;
  roundNumber: number;
  challengeId: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface RoundResultView {
  subjectId: string;
  score: number;
  eliminated: boolean;
}

export interface BattleRoundView extends RoundView {
  results: RoundResultView[];
}

export interface RecordResultInput {
  subjectType: BattleSubjectType;
  subjectId: string;
  score: number;
  submittedAt: Date | string;
  submissionId?: string;
}

export interface ClosedRoundSummary {
  roundId: string;
  status: 'closed';
  eliminated: Array<{ subjectId: string; roundNumber: number }>;
  remaining: number;
}

const WARNING_WINDOW_MS = 60_000;

/**
 * T220 [US14] — manches synchronisées par l'horloge serveur (FR-097/FR-098).
 *
 * `schedule`, `openDue`, `warnDue` et `closeDue` sont idempotents : le job
 * récurrent peut les rejouer sans doubler une émission ni une élimination.
 * Une déconnexion ne modifie aucun état : la manche continue à l'échéance.
 */
@Injectable()
export class RoundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly eligibility: EligibilityService,
    private readonly elimination: EliminationService,
    private readonly spectators: SpectatorService,
    private readonly gateway: BattleRoyaleGateway
  ) {}

  async schedule(eventId: string, input: ScheduleRoundInput): Promise<RoundView> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    if (event.type !== 'battle_royale') {
      throw new BadRequestException({
        code: 'NOT_BATTLE_ROYALE',
        message: 'Cet événement n’est pas une battle royale'
      });
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      throw new BadRequestException({
        code: 'INVALID_ROUND_RANGE',
        message: 'La manche doit se terminer après son début'
      });
    }

    // FR-101 : sans minimum, aucun round n'est créé et les inscrits sont informés.
    await this.eligibility.check(eventId);

    const last = await this.prisma.battleRound.aggregate({
      where: { eventId },
      _max: { roundNumber: true }
    });
    const roundNumber = (last._max.roundNumber ?? 0) + 1;
    const existing = await this.prisma.battleRound.findUnique({
      where: { eventId_roundNumber: { eventId, roundNumber } }
    });
    if (existing) return this.toView(existing);

    const round = await this.prisma.battleRound.create({
      data: {
        id: uuidv7(),
        eventId,
        roundNumber,
        challengeId: input.challengeId,
        startsAt,
        endsAt
      }
    });
    return this.toView(round);
  }

  /** Vue REST des manches et de leurs résultats (arène et spectateurs). */
  async list(eventId: string): Promise<BattleRoundView[]> {
    const rounds = await this.prisma.battleRound.findMany({
      where: { eventId },
      orderBy: { roundNumber: 'asc' },
      include: { results: { orderBy: { subjectId: 'asc' } } }
    });
    return rounds.map((round) => ({
      ...this.toView(round),
      results: round.results.map((result) => ({
        subjectId: result.subjectId,
        score: result.score?.toNumber() ?? 0,
        eliminated: result.eliminated
      }))
    }));
  }

  /** Ouvre les manches dont l'échéance de début est atteinte. */
  async openDue(): Promise<RoundView[]> {
    const now = this.clock.now();
    const due = await this.prisma.battleRound.findMany({
      where: { status: 'scheduled', startsAt: { lte: now }, endsAt: { gt: now } }
    });
    const opened: RoundView[] = [];
    for (const round of due) {
      const claimed = await this.prisma.battleRound.updateMany({
        where: { id: round.id, status: 'scheduled' },
        data: { status: 'open' }
      });
      if (claimed.count === 0) continue;
      this.gateway.started({
        eventId: round.eventId,
        roundNumber: round.roundNumber,
        challengeId: round.challengeId,
        endsAt: round.endsAt.toISOString()
      });
      opened.push(this.toView({ ...round, status: 'open' }));
    }
    return opened;
  }

  /** Prévenir 60 s avant la clôture, une seule fois par manche. */
  async warnDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.prisma.battleRound.findMany({
      where: {
        status: 'open',
        warningSentAt: null,
        endsAt: { gt: now, lte: new Date(now.getTime() + WARNING_WINDOW_MS) }
      }
    });
    for (const round of due) {
      const claimed = await this.prisma.battleRound.updateMany({
        where: { id: round.id, warningSentAt: null },
        data: { warningSentAt: now }
      });
      if (claimed.count === 0) continue;
      this.gateway.warning(
        round.eventId,
        round.roundNumber,
        round.endsAt.getTime() - now.getTime()
      );
    }
    return due.length;
  }

  /** Enregistre (ou corrige) le résultat d'un sujet pour une manche. */
  async recordResult(roundId: string, input: RecordResultInput): Promise<void> {
    const round = await this.prisma.battleRound.findUnique({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException({ code: 'ROUND_NOT_FOUND', message: 'Manche introuvable' });
    }
    if (round.status === 'closed') {
      throw new BadRequestException({
        code: 'ROUND_CLOSED',
        message: 'La manche est déjà close'
      });
    }
    if (input.subjectType === 'player') {
      await this.spectators.assertActive(round.eventId, input.subjectType, input.subjectId);
    }

    const submittedAt = new Date(input.submittedAt);
    if (Number.isNaN(submittedAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_SUBMISSION_DATE',
        message: 'Date de soumission invalide'
      });
    }

    await this.prisma.roundResult.upsert({
      where: {
        roundId_subjectType_subjectId: {
          roundId,
          subjectType: input.subjectType as SubjectType,
          subjectId: input.subjectId
        }
      },
      create: {
        id: uuidv7(),
        roundId,
        subjectType: input.subjectType as SubjectType,
        subjectId: input.subjectId,
        submissionId: input.submissionId,
        score: new Prisma.Decimal(input.score),
        submittedAt
      },
      update: {
        submissionId: input.submissionId,
        score: new Prisma.Decimal(input.score),
        submittedAt
      }
    });
  }

  /** Clôt les manches échues, applique l'élimination et diffuse les résultats. */
  async closeDue(): Promise<ClosedRoundSummary[]> {
    const now = this.clock.now();
    const due = await this.prisma.battleRound.findMany({
      where: { status: { in: ['scheduled', 'open'] }, endsAt: { lte: now } }
    });
    const summaries: ClosedRoundSummary[] = [];

    for (const round of due) {
      const claimed = await this.prisma.battleRound.updateMany({
        where: { id: round.id, status: { in: ['scheduled', 'open'] } },
        data: { status: 'closed' }
      });
      if (claimed.count === 0) continue;

      const event = await this.prisma.event.findUniqueOrThrow({ where: { id: round.eventId } });
      const results = await this.prisma.roundResult.findMany({ where: { roundId: round.id } });
      const candidates: EliminationCandidate[] = results
        .filter((result) => result.score !== null && result.submittedAt !== null)
        .map((result) => ({
          subjectType: result.subjectType === 'team' ? 'team' : 'player',
          subjectId: result.subjectId,
          score: result.score!.toNumber(),
          submittedAt: result.submittedAt!.toISOString()
        }));

      const activeBefore = await this.prisma.eventParticipant.count({
        where: { eventId: round.eventId, eliminatedAt: null }
      });
      const eliminated = this.elimination.select(candidates, event);
      await this.prisma.roundResult.updateMany({
        where: {
          roundId: round.id,
          subjectId: { in: eliminated.map((candidate) => candidate.subjectId) }
        },
        data: { eliminated: true }
      });

      let remaining = activeBefore;
      const summary: ClosedRoundSummary = {
        roundId: round.id,
        status: 'closed',
        eliminated: [],
        remaining
      };
      for (const candidate of eliminated) {
        if (candidate.subjectType === 'player') {
          await this.spectators.eliminate(round.eventId, candidate.subjectType, candidate.subjectId);
        }
        remaining = Math.max(0, remaining - 1);
        this.gateway.eliminated(round.eventId, {
          subjectId: candidate.subjectId,
          roundNumber: round.roundNumber,
          remaining,
          reason: 'lowest_score'
        });
        summary.eliminated.push({ subjectId: candidate.subjectId, roundNumber: round.roundNumber });
      }
      summary.remaining = remaining;

      this.gateway.closed(round.eventId, {
        roundNumber: round.roundNumber,
        results: results.map((result) => ({
          subjectId: result.subjectId,
          score: result.score?.toNumber() ?? 0
        }))
      });

      if (remaining <= 1) await this.finish(round.eventId, remaining);
      summaries.push(summary);
    }
    return summaries;
  }

  private async finish(eventId: string, remaining: number): Promise<void> {
    if (remaining !== 1) return;
    const winner = await this.prisma.eventParticipant.findFirst({
      where: { eventId, eliminatedAt: null, subjectType: 'player' },
      select: { subjectId: true }
    });
    if (!winner) return;
    const user = await this.prisma.user.findUnique({
      where: { id: winner.subjectId },
      select: { pseudonym: true }
    });
    await this.prisma.event.update({ where: { id: eventId }, data: { status: 'finished' } });
    this.gateway.finished(eventId, {
      subjectId: winner.subjectId,
      displayName: user?.pseudonym ?? winner.subjectId
    });
  }

  private toView(round: BattleRound): RoundView {
    return {
      id: round.id,
      eventId: round.eventId,
      roundNumber: round.roundNumber,
      challengeId: round.challengeId,
      startsAt: round.startsAt.toISOString(),
      endsAt: round.endsAt.toISOString(),
      status: round.status
    };
  }
}
