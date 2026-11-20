import type { components } from './api-types';
import { api } from './api-client';

export type Team = components['schemas']['Team'];
export type TeamInvitation = components['schemas']['TeamInvitation'];
export type TeamOfficialSubmission = components['schemas']['TeamOfficialSubmission'];
export type ContributionScore = components['schemas']['ContributionScore'];
export type TeamMember = components['schemas']['TeamMember'];

/** US8 (FR-055 à FR-060) : équipes, invitations, capitainerie et contribution. */
export function getTeams(signal?: AbortSignal): Promise<Team[]> {
  return api.get<Team[]>('/teams', { signal });
}

export function getTeam(teamId: string, signal?: AbortSignal): Promise<Team> {
  return api.get<Team>(`/teams/${encodeURIComponent(teamId)}`, { signal });
}

export function createTeam(
  input: { name: string; tag: string; description?: string },
  signal?: AbortSignal
): Promise<Team> {
  return api.post<Team>('/teams', input, { signal });
}

export function inviteMember(
  teamId: string,
  input: { pseudonym?: string } = {},
  signal?: AbortSignal
): Promise<TeamInvitation> {
  return api.post<TeamInvitation>(`/teams/${encodeURIComponent(teamId)}/invitations`, input, {
    signal
  });
}

export function joinTeam(teamId: string, token: string, signal?: AbortSignal): Promise<Team> {
  return api.post<Team>(
    `/teams/${encodeURIComponent(teamId)}/members`,
    { token },
    { signal }
  );
}

export function leaveTeam(teamId: string, userId: string, signal?: AbortSignal): Promise<void> {
  return api.delete<void>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
    signal
  });
}

export function transferCaptain(
  teamId: string,
  userId: string,
  signal?: AbortSignal
): Promise<Team> {
  return api.patch<Team>(
    `/teams/${encodeURIComponent(teamId)}/captain`,
    { userId },
    { signal }
  );
}

export function designateOfficialSubmission(
  teamId: string,
  input: { challengeId: string; submissionId: string },
  signal?: AbortSignal
): Promise<TeamOfficialSubmission> {
  return api.post<TeamOfficialSubmission>(
    `/teams/${encodeURIComponent(teamId)}/official-submission`,
    input,
    { signal }
  );
}

export function getContributions(teamId: string, signal?: AbortSignal): Promise<ContributionScore[]> {
  return api.get<ContributionScore[]>(`/teams/${encodeURIComponent(teamId)}/contributions`, {
    signal
  });
}
