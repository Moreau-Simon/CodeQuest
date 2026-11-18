import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/** Événements de soumission (T079, contrat `websocket-events.md` §3.1). */
export const SUBMISSION_EVENTS = {
  queued: 'submission.queued',
  started: 'submission.started',
  verdict: 'submission.verdict'
} as const;

@Injectable()
export class SubmissionsGateway {
  constructor(private readonly realtime: RealtimeGateway) {}

  queued(userId: string, submissionId: string, challengeId: string, position: number): void {
    this.realtime.emitToUser(userId, SUBMISSION_EVENTS.queued, {
      submissionId,
      challengeId,
      position
    });
  }

  started(userId: string, submissionId: string, attemptNo: number): void {
    this.realtime.emitToUser(userId, SUBMISSION_EVENTS.started, { submissionId, attemptNo });
  }

  verdict(
    userId: string,
    verdict: {
      submissionId: string;
      status: string;
      score: number | null;
      cpuTimeMedianMs: number | null;
      testsPassed: number | null;
      testsTotal: number | null;
      verdictReason: string | null;
      isOfficial: boolean;
    }
  ): void {
    this.realtime.emitToUser(userId, SUBMISSION_EVENTS.verdict, verdict);
  }
}
