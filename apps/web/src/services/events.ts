import type { components } from './api-types';
import { api } from './api-client';

export type Event = components['schemas']['Event'];
export type EventResults = components['schemas']['EventResults'];
export type EventSolution = components['schemas']['EventSolution'];
export type EventParticipation = components['schemas']['EventParticipation'];
export type EventAttempt = components['schemas']['EventAttempt'];

/** US9 (FR-061 à FR-065) : événements, essai unique et résultats. */
export function getEvents(signal?: AbortSignal): Promise<Event[]> {
  return api.get<Event[]>('/events', { signal });
}

export function joinEvent(eventId: string, signal?: AbortSignal): Promise<EventParticipation> {
  return api.post<EventParticipation>(`/events/${encodeURIComponent(eventId)}/join`, {}, { signal });
}

export function startEvent(eventId: string, signal?: AbortSignal): Promise<EventAttempt> {
  return api.post<EventAttempt>(`/events/${encodeURIComponent(eventId)}/start`, {}, { signal });
}

export function getEventResults(eventId: string, signal?: AbortSignal): Promise<EventResults> {
  return api.get<EventResults>(`/events/${encodeURIComponent(eventId)}/results`, { signal });
}

export function getEventSolution(
  eventId: string,
  challengeId: string,
  signal?: AbortSignal
): Promise<EventSolution> {
  return api.get<EventSolution>(
    `/events/${encodeURIComponent(eventId)}/challenges/${encodeURIComponent(challengeId)}/solution`,
    { signal }
  );
}
