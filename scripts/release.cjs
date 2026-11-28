#!/usr/bin/env node
/**
 * Génération du CHANGELOG et calcul SemVer à partir des Conventional Commits (T272).
 * Utilisé par `.github/workflows/release.yml` après une CI verte sur `main`.
 */
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const SECTIONS = [
  ['breaking', 'Changements cassants'],
  ['feat', 'Fonctionnalités'],
  ['fix', 'Corrections'],
  ['perf', 'Performance'],
  ['refactor', 'Refactorisations'],
  ['docs', 'Documentation'],
  ['chore', 'Divers']
];

/** Analyse `git log --pretty=%h %s` et ignore les lignes non conventionnelles. */
function parseCommits(log) {
  const pattern = /^[0-9a-f]{7,40}\s+(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;
  return String(log)
    .split('\n')
    .map((line) => pattern.exec(line.trim()))
    .filter(Boolean)
    .map((match) => ({
      type: match[1],
      scope: match[2] ?? null,
      breaking: match[3] === '!' || /\bBREAKING CHANGE\b/.test(match[4]),
      subject: match[4]
    }));
}

function bumpVersion(current, commits) {
  const parts = String(current).replace(/^v/, '').split('.').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Version SemVer invalide : ${current}`);
  }
  const [major, minor, patch] = parts;
  if (commits.some((commit) => commit.breaking)) return `${major + 1}.0.0`;
  if (commits.some((commit) => commit.type === 'feat')) return `${major}.${minor + 1}.0`;
  if (commits.some((commit) => commit.type === 'fix' || commit.type === 'perf')) {
    return `${major}.${minor}.${patch + 1}`;
  }
  return null;
}

function renderChangelog(previous, next, commits, date) {
  const lines = [`## [${next}] - ${date}`, ''];
  for (const [type, title] of SECTIONS) {
    const selected = commits.filter((commit) =>
      type === 'breaking' ? commit.breaking : !commit.breaking && commit.type === type
    );
    if (selected.length === 0) continue;
    lines.push(`### ${title}`, '');
    for (const commit of selected) {
      const scope = commit.scope ? `**${commit.scope}** : ` : '';
      lines.push(`- ${scope}${commit.subject}`);
    }
    lines.push('');
  }
  lines.push(`Comparaison : \`v${previous}...v${next}\``, '');
  return lines.join('\n');
}

function tagCommand(version) {
  return `git tag -a v${version} -m "Release v${version}"`;
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function generate() {
  const changelogPath = join(ROOT, 'CHANGELOG.md');
  const content = readFileSync(changelogPath, 'utf8');
  const header = content.split(/^## \[/m)[0].trimEnd();
  const current = /## \[(\d+\.\d+\.\d+)\]/.exec(content)?.[1] ?? '0.1.0';
  let range = 'HEAD';
  try {
    const last = git('describe', '--tags', '--abbrev=0');
    range = `${last}..HEAD`;
  } catch {
    // Aucun tag : tous les commits depuis l'origine sont pris en compte.
  }
  const commits = parseCommits(git('log', '--pretty=%h %s', range));
  const next = bumpVersion(current, commits);
  if (!next) return '';
  const date = process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10);
  const entry = renderChangelog(current, next, commits, date);
  writeFileSync(changelogPath, `${header}\n\n${entry}\n${content.slice(header.length).trimStart()}`);
  process.stdout.write(next);
  return next;
}

module.exports = { parseCommits, bumpVersion, renderChangelog, tagCommand, generate };

if (require.main === module) generate();
