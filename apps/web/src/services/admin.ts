import { api } from './api-client';

export interface AdminStats {
  activeUsers: number;
  totalSubmissions: number;
  passedSubmissions: number;
  pendingSubmissions: number;
  successRate: number;
  popularChallenges: Array<{
    challengeId: string;
    title: string;
    difficulty: number;
    submissionsCount: number;
  }>;
}

export interface AdminUser {
  id: string;
  email: string;
  pseudonym: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  level: number;
  xp: number;
  createdAt: string;
  roles: string[];
}

export interface AdminAuditLog {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipPrefix: string | null;
  createdAt: string;
}

export interface ChallengeDraftInput {
  themeId: string;
  type: string;
  difficulty: number;
  title: string;
  statement: string;
  languages: string[];
  basePoints: number;
  perfMax?: number;
  referenceSolution?: string;
  tests?: Array<{
    input: unknown;
    expected: unknown;
    isHidden?: boolean;
    name?: string;
  }>;
}

export function fetchAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return api.get<AdminStats>('/admin/stats', { signal });
}

export function fetchAdminUsers(
  cursor?: string,
  signal?: AbortSignal
): Promise<{ items: AdminUser[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return api.get(`/admin/users${query}`, { signal });
}

export function assignUserRole(userId: string, role: string): Promise<{ ok: boolean }> {
  return api.post(`/admin/users/${userId}/roles`, { role });
}

export function revokeUserRole(userId: string, role: string): Promise<{ ok: boolean }> {
  return api.delete(`/admin/users/${userId}/roles/${role}`);
}

export function updateUserStatus(
  userId: string,
  status: string,
  reason?: string
): Promise<{ id: string; status: string }> {
  return api.patch(`/admin/users/${userId}/status`, { status, reason });
}

export function createChallengeDraft(data: ChallengeDraftInput): Promise<{ id: string }> {
  return api.post('/admin/challenges', data);
}

export function validateChallenge(challengeId: string): Promise<{
  challengeId: string;
  status: string;
  tOptMs: number;
  tMaxMs: number;
  testsTotal: number;
}> {
  return api.post(`/admin/challenges/${challengeId}/validate`);
}

export function fetchAuditLogs(
  params: { actorId?: string; cursor?: string } = {},
  signal?: AbortSignal
): Promise<{ items: AdminAuditLog[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams();
  if (params.actorId) searchParams.set('actorId', params.actorId);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  const q = searchParams.toString();
  return api.get(`/admin/audit-logs${q ? `?${q}` : ''}`, { signal });
}
