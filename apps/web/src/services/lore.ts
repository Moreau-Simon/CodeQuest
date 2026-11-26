import { api } from './api-client';
import type { components } from './api-types';

export type LoreChapter = components['schemas']['LoreChapter'];

/** Catalogue public (FR-003) : le contenu des chapitres verrouillés est absent. */
export function listLoreChapters(signal?: AbortSignal): Promise<LoreChapter[]> {
  return api.get<LoreChapter[]>('/lore/chapters', { signal });
}

/** Persistance de l'état de lecture (FR-078). */
export function markChapterRead(chapterId: string): Promise<LoreChapter> {
  return api.post<LoreChapter>(`/lore/chapters/${chapterId}/read`, {});
}
