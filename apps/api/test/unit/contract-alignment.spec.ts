import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** T269 — garde de cohérence contractuelle écrite avant les alignments. */
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('Cohérence des contrats (T269)', () => {
  it('consigne les 26 écarts audités et leur résolution', () => {
    const report = read('docs/operations/contract-alignment.md');
    expect(report).toContain('websocket-events.md');
    expect(report).toContain('runner-job.md');
    expect(report).toContain('assets-service.md');
    expect(report).toContain('openapi.yaml');
    expect(report.match(/E\d{2}/g)?.length ?? 0).toBeGreaterThanOrEqual(26);
  });

  it('aligne le contrat runner sur la soumission d’équipe', () => {
    expect(read('apps/api/src/modules/submissions/submissions.service.ts')).toContain(
      "subjectType: input.teamId ? 'team' : 'player'"
    );
    expect(read('specs/001-codequest-platform/contracts/runner-job.md')).toContain('teamId');
  });

  it('aligne le contrat temps réel sur la gateway', () => {
    const gateway = read('apps/api/src/realtime/realtime.gateway.ts');
    expect(gateway).toContain("@SubscribeMessage('submission.watch')");
    expect(gateway).toContain("'presence.changed'");
    expect(gateway).toContain('maxHttpBufferSize: 8192');
    const yjs = read('apps/api/src/realtime/yjs.provider.ts');
    expect(yjs.match(/docId: key/g)?.length).toBeGreaterThanOrEqual(2);
    const contract = read('specs/001-codequest-platform/contracts/websocket-events.md');
    expect(contract).toContain('leaderboard:<scope>:<scopeId>:<subjectType>:<period>');
    expect(contract).toContain('subjectType');
  });

  it('aligne les contrats assets et openapi sur le service', () => {
    const assets = read('specs/001-codequest-platform/contracts/assets-service.md');
    for (const marker of ['ciphertext', '-<variant>', 'decryptionStyle', 'degraded']) {
      expect(assets).toContain(marker);
    }
    const openapi = read('specs/001-codequest-platform/contracts/openapi.yaml');
    for (const path of ['/admin/stats', '/admin/users/{userId}/roles', '/admin/challenges/{challengeId}']) {
      expect(openapi).toContain(path);
    }
  });
});
