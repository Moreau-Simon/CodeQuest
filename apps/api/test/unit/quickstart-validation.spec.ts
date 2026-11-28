import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** T270 — garde de traçabilité écrite avant l'exécution du quickstart. */
const ROOT = join(__dirname, '..', '..', '..', '..');

describe('Validation du quickstart (T270)', () => {
  const report = () => readFileSync(join(ROOT, 'docs/operations/quickstart-validation.md'), 'utf8');

  it("consigne l'exécution des scénarios S1 à S15 et leurs écarts", () => {
    const content = report();
    for (let scenario = 1; scenario <= 15; scenario += 1) {
      expect(content).toContain(`S${scenario}`);
    }
    expect(content).toContain('Écarts');
    expect(content).toContain('gVisor');
    expect(content).toContain('k6');
  });

  it('consigne les portes rejouées et leur résultat', () => {
    const content = report();
    for (const gate of [
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm test:integration',
      'pytest',
      'Playwright',
      'axe-core'
    ]) {
      expect(content).toContain(gate);
    }
  });
});
