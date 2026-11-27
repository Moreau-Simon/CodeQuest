/** T243 (FR-103) : cache applicatif des cours déjà consultés. */
const LESSON_CACHE = 'codequest-lessons';

function key(lessonId: string): string {
  return `/api/v1/lessons/${encodeURIComponent(lessonId)}`;
}

export async function cacheLesson(lessonId: string, value: unknown): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(LESSON_CACHE);
  await cache.put(
    key(lessonId),
    new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  );
}

export async function cachedLesson<T>(lessonId: string): Promise<T | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(LESSON_CACHE);
  const response = await cache.match(key(lessonId));
  if (!response) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
