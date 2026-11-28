import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** T268 — test de garde écrit avant le nettoyage (constitution IV). */
const ROOT = join(__dirname, '..', '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.venv', '__pycache__'].includes(entry.name)) {
        return [];
      }
      return sourceFiles(path);
    }
    return /\.(ts|tsx|py)$/.test(entry.name) ? [path] : [];
  });
}

describe('Nettoyage du code mort (T268)', () => {
  it('supprime la page catalogue obsolète au profit de CatalogPage', () => {
    expect(
      existsSync(join(ROOT, 'apps/web/src/pages/challenges/ChallengesPage.tsx'))
    ).toBe(false);
    expect(
      readFileSync(
        join(ROOT, 'apps/web/src/pages/challenges/challenges.test.tsx'),
        'utf8'
      )
    ).not.toContain('ChallengesPage');
  });

  it('harmonise les contrôleurs admin en suffixe .admin.controller', () => {
    const dir = join(ROOT, 'apps/api/src/modules/chat');
    expect(existsSync(join(dir, 'chat.admin.controller.ts'))).toBe(true);
    expect(existsSync(join(dir, 'chat-admin.controller.ts'))).toBe(false);
  });

  it('ne laisse aucun marqueur TODO/FIXME dans le code source', () => {
    const offenders = [
      'apps/api/src',
      'apps/web/src',
      'services/runner/src',
      'services/assets/app'
    ]
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((path) => /\b(TODO|FIXME|XXX|HACK)\b/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
