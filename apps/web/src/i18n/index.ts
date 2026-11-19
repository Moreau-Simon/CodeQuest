import { fr, type TranslationKey } from './fr';

/**
 * Helper de traduction minimal — tous les textes visibles sont externalisés (FR-107).
 * Aucun texte en dur dans les composants.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const template: string = fr[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(vars[name] ?? `{{${name}}}`)
  );
}

export type { TranslationKey };
