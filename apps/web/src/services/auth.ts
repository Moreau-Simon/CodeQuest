import type { ApiError } from './api-client';
import { api } from './api-client';

/** Profil courant, aligné sur `components/schemas/Profile` du contrat. */
export interface Profile {
  id: string;
  pseudonym: string;
  email: string;
  emailVerified: boolean;
  level: number;
  xp: number;
  avatarUrl: string | null;
  preferredLanguage: 'python' | 'javascript';
  preferences: Record<string, unknown>;
  badges: string[];
}

/** Session active, alignée sur `components/schemas/Session`. */
export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipPrefix: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface RegisterInput {
  email: string;
  pseudonym: string;
  password: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface ProfilePatch {
  pseudonym?: string;
  preferredLanguage?: 'python' | 'javascript';
  preferences?: Record<string, unknown>;
  avatarKey?: string | null;
}

export function fetchProfile(signal?: AbortSignal): Promise<Profile> {
  return api.get<Profile>('/me', { signal });
}

export function register(input: RegisterInput): Promise<void> {
  return api.post<void>('/auth/register', input);
}

export function login(input: LoginInput): Promise<void> {
  return api.post<void>('/auth/login', input);
}

export function logout(all = false): Promise<void> {
  return api.post<void>('/auth/logout', all ? { all: true } : {});
}

export function refreshSession(): Promise<void> {
  return api.post<void>('/auth/refresh');
}

export function forgotPassword(identifier: string): Promise<void> {
  return api.post<void>('/auth/forgot-password', { identifier });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return api.post<void>('/auth/reset-password', { token, password });
}

export function verifyEmail(token: string): Promise<void> {
  return api.post<void>('/auth/verify-email', { token });
}

export function updateProfile(patch: ProfilePatch): Promise<Profile> {
  return api.patch<Profile>('/me', patch);
}

export function listSessions(): Promise<SessionSummary[]> {
  return api.get<SessionSummary[]>('/me/sessions');
}

export function revokeSession(sessionId: string): Promise<void> {
  return api.delete<void>(`/me/sessions/${encodeURIComponent(sessionId)}`);
}

export function revokeAllSessions(): Promise<void> {
  return api.delete<void>('/me/sessions');
}

export function deleteAccount(password: string): Promise<void> {
  return api.delete<void>('/me', { body: { password } });
}

export function exportPersonalData(): Promise<Record<string, unknown>> {
  return api.get<Record<string, unknown>>('/me/export');
}

/** Un 401/403 signifie « pas de session », pas une panne du serveur. */
export function isUnauthenticated(error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  return status === 401 || status === 403;
}
