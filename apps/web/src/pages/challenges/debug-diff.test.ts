import { describe, expect, it } from 'vitest';
import { modifiedLineNumbers } from './debug-diff';

/**
 * T147 [US7] — Calcul des lignes modifiées dans le navigateur (FR-038, A5) :
 * doit ignorer le style (indentation, espaces, CRLF) comme le DiffService API.
 */
describe('modifiedLineNumbers', () => {
  it('ne compte aucune ligne quand seul le style change', () => {
    const before = 'def solve(values):\n    return sorted(values)\n';
    const after = 'def solve(values):\r\n  return  sorted(values)\r\n';
    expect(modifiedLineNumbers(before, after)).toEqual([]);
  });

  it('repère la ligne remplacée', () => {
    const before = 'def solve(values):\n    return custom_sort(values)\n';
    const after = 'def solve(values):\n    return sorted(values)\n';
    expect(modifiedLineNumbers(before, after)).toEqual([2]);
  });

  it('repère une ligne ajoutée', () => {
    const before = 'def solve(values):\n    return sorted(values)\n';
    const after = 'def solve(values):\n    values = list(values)\n    return sorted(values)\n';
    expect(modifiedLineNumbers(before, after)).toEqual([2]);
  });

  it('compte toutes les lignes d’un code entièrement réécrit', () => {
    expect(modifiedLineNumbers('ligne A\nligne B', 'ligne X\nligne Y')).toEqual([1, 2]);
  });
});
