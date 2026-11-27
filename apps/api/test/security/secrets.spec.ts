import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** T248 [P] [US17] (FR-111) : aucun secret versionné et `.env.example` sans valeur réelle. */
const ROOT = resolve(__dirname, '../../../..');

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'clé privée', regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'jeton GitHub', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'clé AWS', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'jeton Slack', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'JWT signé', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ }
];

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function readFile(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('Non-fuite de secrets (T248 / FR-111)', () => {
  it('ne versionne aucun fichier .env contenant des valeurs', () => {
    const envFiles = trackedFiles().filter(
      (file) => /(^|\/)\.env($|\.)/.test(file) && file !== '.env.example'
    );

    expect(envFiles).toEqual([]);
    expect(existsSync(resolve(ROOT, '.env.example'))).toBe(true);
  });

  it('ne contient aucun secret dans les fichiers suivis', () => {
    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      // Les empreintes base64 des lockfiles ne sont pas des secrets.
      if (file.endsWith('pnpm-lock.yaml') || file.endsWith('package-lock.json')) continue;
      if (/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(file)) continue;
      const content = readFile(file);
      for (const { name, regex } of SECRET_PATTERNS) {
        if (regex.test(content)) offenders.push(`${file} (${name})`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('fournit un .env.example avec des valeurs factices et aucun secret réel', () => {
    const content = readFile('.env.example');
    const assignments = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return { key: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
      });

    expect(assignments.length).toBeGreaterThan(10);
    for (const { key, value } of assignments) {
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
      for (const { name, regex } of SECRET_PATTERNS) {
        expect({ key, name, found: regex.test(value) }).toEqual({ key, name, found: false });
      }
      expect({ key, length: value.length }).toEqual({
        key,
        length: expect.any(Number)
      });
      expect(value.length).toBeLessThan(80);
      expect({ key, value }).toEqual({
        key,
        value: expect.stringMatching(/(example|placeholder|changez-moi|vide|dev|localhost|\$\{|^[a-z0-9_-]+$)/i)
      });
    }

    for (const required of [
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'VAPID_PRIVATE_KEY',
      'LIVEKIT_API_SECRET',
      'ASSETS_SEED_KEY'
    ]) {
      expect(assignments.map(({ key }) => key)).toContain(required);
    }
  });
});
