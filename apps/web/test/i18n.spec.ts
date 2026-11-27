import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fr } from '../src/i18n/fr';

const ROOT = join(process.cwd(), 'src');
const HINT =
  /[àâçéèêëîïôùûüœæÀÂÇÉÈÊËÎÏÔÙÛÜŒÆ]|\b(?:filtrer|date|action|cible|acteur|titre|rôle|rôles|utilisateur|utilisateurs|utilisateur|rechercher|impossible|erreur|python|javascript|nouveau|actifs|journal|aucune|donnée|disponible)\b/i;

function sources(extension: string): Array<{ path: string; text: string }> {
  const files: Array<{ path: string; text: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (
        entry.endsWith(extension) &&
        !entry.includes('.test.') &&
        !path.includes('/i18n/')
      ) {
        files.push({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') });
      }
    }
  };
  visit(ROOT);
  return files;
}

function linesBefore(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

describe('i18n (T241 / FR-107)', () => {
  it('ne référence que des clés définies dans la catalogue français', () => {
    const undefinedKeys: string[] = [];
    for (const { path, text } of sources('.tsx')) {
      for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
        if (!(match[1]! in fr)) undefinedKeys.push(`${path}: ${match[1]}`);
      }
    }
    expect(undefinedKeys).toEqual([]);
  });

  it('définit les clés nécessaires à la PWA, aux notifications et au clavier de symboles', () => {
    const requises = [
      'offline.banner',
      'offline.unavailable',
      'push.enable',
      'push.enabled',
      'push.declined',
      'push.eventStarting',
      'push.koEnded',
      'editor.symbols',
      'editor.insertSymbol'
    ];
    expect(requises.filter((key) => !(key in fr))).toEqual([]);
  });

  it('n’affiche aucun texte français en dur dans les composants', () => {
    const constants: string[] = [];
    for (const { path, text } of sources('.tsx')) {
      for (const match of text.matchAll(/>\s*([^<>{}\s][^<>{}]*?)\s*</g)) {
        const value = match[1]!.trim();
        if (/[;=]|\bconst\b|\buseState\b/.test(value)) continue;
        if (HINT.test(value)) constants.push(`${path}:${linesBefore(text, match.index)} ${value}`);
      }
      for (const match of text.matchAll(
        /(?:placeholder|title|aria-label|alt|label)=\{?"([^"{}]+)"\}?/g
      )) {
        const value = match[1]!.trim();
        if (HINT.test(value)) constants.push(`${path}:${linesBefore(text, match.index)} ${value}`);
      }
    }
    expect(constants).toEqual([]);
  });

  it('n’affiche aucun message d’erreur en dur dans les hooks et services', () => {
    const constants: string[] = [];
    for (const { path, text } of sources('.ts')) {
      for (const match of text.matchAll(/(?:setError|new Error|message)\s*\(?\s*:?\s*'([^']+)'/g)) {
        if (HINT.test(match[1]!)) constants.push(`${path}:${linesBefore(text, match.index)}`);
      }
    }
    expect(constants).toEqual([]);
  });
});
