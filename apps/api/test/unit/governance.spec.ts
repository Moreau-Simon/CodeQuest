import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T271, T272 et T280 — écrits avant les artefacts (constitution IV).
 * La gouvernance du dépôt fait partie du livrable : constitution, release
 * SemVer et protection de `main` doivent être versionnés et vérifiables.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const release = require(join(ROOT, 'scripts', 'release.cjs'));

describe('Constitution (T271)', () => {
  it('versionne les cinq principes et les portes associées', () => {
    const content = read('.specify/memory/constitution.md');
    for (const marker of [
      'Isolation de l’exécution',
      'Sécurité par défaut',
      'Mesure équitable',
      'Tests d’abord',
      'Modularité',
      'Version',
      'Portes'
    ]) {
      expect(content).toContain(marker);
    }
    for (const numeral of ['I.', 'II.', 'III.', 'IV.', 'V.']) {
      expect(content).toContain(numeral);
    }
    expect(content).not.toMatch(/TODO|TBD|à rédiger/i);
  });
});

describe('Release SemVer (T272)', () => {
  it('classe les Conventional Commits et détermine la prochaine version', () => {
    const commits = release.parseCommits(
      [
        'abc1234 feat(api): ajouter le filtre',
        'def5678 fix(web): corriger le focus',
        'ccc3333 docs: mettre à jour le guide',
        'ddd4444 feat!: casser le contrat',
        'eee5555 random commit'
      ].join('\n')
    );
    expect(commits).toHaveLength(4);
    expect(commits[3].breaking).toBe(true);
    expect(release.bumpVersion('1.2.3', commits)).toBe('2.0.0');
    expect(release.bumpVersion('1.2.3', commits.slice(0, 1))).toBe('1.3.0');
    expect(release.bumpVersion('1.2.3', commits.slice(1, 2))).toBe('1.2.4');
    expect(release.bumpVersion('1.2.3', commits.slice(2, 3))).toBeNull();
  });

  it('génère un CHANGELOG daté et une commande de tag annoté', () => {
    const commits = release.parseCommits(
      'aaa1111 feat(api): ajouter le filtre\nbbb2222 fix(web): corriger le focus'
    );
    const changelog = release.renderChangelog('0.1.0', '0.2.0', commits, '2026-11-28');
    expect(changelog).toContain('## [0.2.0] - 2026-11-28');
    expect(changelog).toContain('Fonctionnalités');
    expect(changelog).toContain('ajouter le filtre');
    expect(changelog).toContain('Corrections');
    expect(release.tagCommand('0.2.0')).toContain('git tag -a v0.2.0');

    const workflow = read('.github/workflows/release.yml');
    for (const marker of [
      'workflow_run',
      'git tag -a',
      'SemVer',
      'CHANGELOG.md',
      'scripts/release.cjs'
    ]) {
      expect(workflow).toContain(marker);
    }
    expect(workflow).not.toContain('git push origin HEAD:main');
    expect(read('CHANGELOG.md')).toContain('## [0.1.0]');
  });
});

describe('Protection de main (T280)', () => {
  it('désigne les propriétaires des zones sensibles', () => {
    const content = read('.github/CODEOWNERS');
    for (const line of [
      '* @Moreau-Simon',
      '/contracts/ @Moreau-Simon',
      '/apps/api/prisma/schema.prisma @Moreau-Simon',
      '/.github/workflows/ @Moreau-Simon'
    ]) {
      expect(content).toContain(line);
    }
  });

  it('exige les portes CI et la revue dans le modèle de PR', () => {
    const content = read('.github/pull_request_template.md').toLowerCase();
    for (const marker of [
      'lint',
      'typecheck',
      'tests',
      'e2e',
      'accessibilité',
      'sécurité',
      'approbation',
      'contracts/',
      'prisma/schema.prisma',
      'commit de merge',
      'suppression de la branche'
    ]) {
      expect(content).toContain(marker);
    }
  });
});
