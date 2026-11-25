import type { components } from './api-types';
import { api } from './api-client';

export type Boss = components['schemas']['Boss'];
export type PlayerHealth = components['schemas']['PlayerHealth'];
export type BossPhaseSubmission = components['schemas']['BossPhaseSubmission'];

/** US10 (FR-066 à FR-071) : boss en phases, PV et pool d'équipe. */
export function getBosses(signal?: AbortSignal): Promise<Boss[]> {
  return api.get<Boss[]>('/bosses', { signal });
}

export function getMyHealth(signal?: AbortSignal): Promise<PlayerHealth> {
  return api.get<PlayerHealth>('/me/health', { signal });
}

export interface SubmitBossPhaseInput {
  language: 'python' | 'javascript';
  code: string;
  /** Raid d'équipe : les dégâts alimentent le pool partagé (FR-071). */
  teamId?: string;
}

export function submitBossPhase(
  bossId: string,
  phaseId: string,
  input: SubmitBossPhaseInput,
  signal?: AbortSignal
): Promise<BossPhaseSubmission> {
  return api.post<BossPhaseSubmission>(
    `/bosses/${encodeURIComponent(bossId)}/phases/${encodeURIComponent(phaseId)}/submissions`,
    input,
    { signal }
  );
}
