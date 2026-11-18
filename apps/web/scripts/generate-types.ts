/**
 * T015 — Génération des types client depuis `contracts/openapi.yaml`.
 *
 * Volontairement **sans dossier `packages/`** (versioning.md §1) : le fichier
 * généré vit dans `apps/web/src/services/api-types.ts` et n'est jamais édité
 * à la main.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const input = resolve(repoRoot, 'specs/001-codequest-platform/contracts/openapi.yaml');
const output = resolve(repoRoot, 'apps/web/src/services/api-types.ts');

mkdirSync(dirname(output), { recursive: true });

console.warn(`→ openapi-typescript ${input}`);
execFileSync('pnpm', ['exec', 'openapi-typescript', input, '-o', output], {
  stdio: 'inherit',
  cwd: resolve(repoRoot, 'apps/web')
});
console.warn(`✓ types générés : ${output}`);
