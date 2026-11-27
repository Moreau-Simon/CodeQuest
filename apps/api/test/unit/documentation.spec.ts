import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T265–T267/T273 — écrit avant la rédaction des documents (constitution IV).
 * La documentation d'exploitation fait partie du livrable : elle doit être
 * versionnée, datée et exempte de placeholders.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');

const REQUIRED: Array<{ path: string; markers: string[] }> = [
  {
    path: 'docs/security/zap-baseline.md',
    markers: ['SC-008', 'ZAP', 'zap-baseline.py', 'Résultat']
  },
  {
    path: 'docs/security/escape-campaign.md',
    markers: ['SC-008', 'network=none', 'shadow', 'fork', 'seccomp']
  },
  {
    path: 'docs/operations/runbook-blocked-submission.md',
    markers: ['file bloquée', 'BullMQ', 'Vérification']
  },
  {
    path: 'docs/operations/runbook-restore.md',
    markers: ['restauration', 'pg_restore', 'Vérification']
  },
  {
    path: 'docs/operations/runbook-aes-rotation.md',
    markers: ['AES', 'rotation', 'chiffrement', 'Vérification']
  },
  {
    path: 'docs/operations/onboarding.md',
    markers: ['validation de défi', 'modération', 'rotation des secrets']
  },
  {
    path: 'docs/user/manuel.md',
    markers: ['inscription', 'défi', 'classement', 'équipe']
  },
  {
    path: 'docs/admin/guide.md',
    markers: ['publication', 'RBAC', 'modération', 'événement']
  }
];

describe('Documentation d’exploitation et de sécurité (T265-T267, T273)', () => {
  it.each(REQUIRED)('fournit $path avec les sections attendues', ({ path, markers }) => {
    const content = readFileSync(join(ROOT, path), 'utf8');
    expect(content.length).toBeGreaterThan(400);
    for (const marker of markers) {
      expect(content.toLowerCase()).toContain(marker.toLowerCase());
    }
    expect(content).not.toMatch(/TODO|TBD|à rédiger/i);
  });
});
