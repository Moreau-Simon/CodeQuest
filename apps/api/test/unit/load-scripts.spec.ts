import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T263 [P] — écrit avant l'implémentation (constitution IV).
 *
 * SC-003/004/005 : les scénarios de charge doivent porter les seuils de la
 * spécification et rester exécutables sans dépendance applicative locale.
 */
const LOAD_DIR = join(__dirname, '..', '..', '..', '..', 'infra', 'load');

function script(name: string): string {
  return readFileSync(join(LOAD_DIR, name), 'utf8');
}

describe('Scripts de charge k6 (T263)', () => {
  it('reste syntaxiquement valide pour le moteur k6 0.50 (pas de séparateur numérique)', () => {
    for (const name of ['browse.js', 'submissions.js', 'realtime.js']) {
      expect(script(name)).not.toMatch(/\b\d_\d/);
    }
  });

  it('browse.js mesure le p95 < 300 ms sur la navigation', () => {
    const source = script('browse.js');
    expect(source).toContain("import http from 'k6/http'");
    expect(source).toMatch(/http_req_duration:\s*\['p\(95\)<300'\]/);
    expect(source).toContain('BASE_URL');
  });

  it('submissions.js soutient 100 soumissions par minute', () => {
    const source = script('submissions.js');
    expect(source).toContain("constant-arrival-rate");
    expect(source).toMatch(/rate:\s*100,\s*timeUnit:\s*'1m'/);
    expect(source).toContain('Idempotency-Key');
  });

  it('realtime.js ouvre 500 connexions temps réel', () => {
    const source = script('realtime.js');
    expect(source).toContain("from 'k6/ws'");
    expect(source).toMatch(/vus:\s*500/);
    expect(source).toContain('socket.io');
  });

  it('consigne la procédure et les seuils dans RESULTS.md', () => {
    const report = script('RESULTS.md');
    expect(report).toContain('SC-003');
    expect(report).toContain('SC-004');
    expect(report).toContain('SC-005');
    expect(report).toContain('k6 run');
  });
});
