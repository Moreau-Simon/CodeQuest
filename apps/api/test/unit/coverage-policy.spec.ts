import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T264 [P] — écrit avant l'implémentation (constitution IV).
 *
 * SC-012 : la couverture métier (scoring, économie, élimination, prérequis)
 * doit être mesurée, seuillée à 80 % et publiée par la CI. Les adaptateurs
 * (controllers, modules Nest, cron) sont hors périmètre : ils sont couverts
 * par les suites d'intégration et de contrat.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const api = readFileSync(join(ROOT, 'apps', 'api', 'jest.config.cjs'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'apps', 'api', 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

const BUSINESS_GLOBS = [
  'src/modules/scoring/*.service.ts',
  'src/modules/economy/ledger.math.ts',
  'src/modules/economy/rewards.service.ts',
  'src/modules/economy/hint.policy.ts',
  'src/modules/battle-royale/elimination.rule.ts',
  'src/modules/battle-royale/elimination.service.ts',
  'src/modules/challenges/prerequisite-check.service.ts',
  'src/modules/challenges/prerequisite-graph.service.ts'
];

describe('Politique de couverture métier (T264)', () => {
  it('seuille chaque module métier à 80 % sur les quatre métriques', () => {
    expect(api).toMatch(/coverageThreshold\s*:/);
    for (const glob of BUSINESS_GLOBS) expect(api).toContain(`'${glob}'`);
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      expect(api).toMatch(new RegExp(`${metric}:\\s*80`));
    }
  });

  it('expose une commande de couverture avec les rapports lcov et json-summary', () => {
    expect(manifest.scripts['test:coverage']).toMatch(/--coverage/);
    expect(manifest.scripts['test:coverage']).toMatch(/coverageReporters=lcov/);
    expect(manifest.scripts['test:coverage']).toMatch(/coverageReporters=json-summary/);
  });

  it('publie le rapport de couverture dans la CI', () => {
    expect(ci).toContain('pnpm --filter @codequest/api test:coverage');
    expect(ci).toContain('actions/upload-artifact');
    expect(ci).toContain('apps/api/coverage');
  });
});
