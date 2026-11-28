import { t } from '../i18n';

/** Enveloppe d'erreur normalisée du contrat `contracts/openapi.yaml`. */
export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown> & { requestId?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorEnvelope['details'];

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details;
  }
}

/**
 * Message affichable pour une erreur API. Le contrat renvoie parfois un message
 * générique (« Requête invalide ») et range les vraies raisons dans
 * `details.errors` : on les remonte à l'utilisateur au lieu du générique.
 */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return t('common.error');

  const errors = error.details?.errors;
  if (Array.isArray(errors)) {
    const details = errors
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter(Boolean);
    if (details.length > 0) return details.join(' ');
  }

  return error.message === 'Requête invalide' ? t('common.error') : error.message;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** En-tête `Idempotency-Key` pour les opérations d'achat (contrat OpenAPI). */
  idempotencyKey?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * Client HTTP de l'API (T043).
 *
 * - envoie toujours les cookies `HttpOnly` (`credentials: 'include'`) ;
 * - sérialise le JSON et pose les en-têtes attendus ;
 * - convertit l'enveloppe `{ code, message, details }` en `ApiError` ;
 * - renvoie `undefined` pour les réponses sans corps (204).
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, headers, ...init } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  if (idempotencyKey) requestHeaders.set('Idempotency-Key', idempotencyKey);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      throw new ApiError(response.status, payload);
    }
    throw new ApiError(response.status, {
      code: 'INTERNAL_ERROR',
      message: typeof payload === 'string' && payload ? payload : t('common.error')
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' })
};
