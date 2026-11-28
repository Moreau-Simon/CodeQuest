import type { FamilyKey } from '../types';

/**
 * Versions volontairement fautives montrées au joueur. Elles ne contiennent
 * jamais la correction : seule la ligne fautive diffère de la solution.
 */
const BUGGY: Partial<Record<FamilyKey, string>> = {
  tri_croissant: 'def solve(values):\n    return sorted(values, reverse=True)\n',
  somme: 'def solve(values):\n    return sum(values[:-1])\n',
  maximum: 'def solve(values):\n    return min(values)\n',
  compte_paires: 'def solve(values):\n    return sum(1 for value in values if value % 2 == 1)\n',
  fibonacci: [
    'def solve(rank):',
    '    previous, current = 0, 1',
    '    for _unused in range(rank):',
    '        previous, current = current, previous',
    '    return previous',
    ''
  ].join('\n'),
  palindrome: 'def solve(text):\n    return text == text[:-1]\n',
  valeurs_uniques: 'def solve(values):\n    return list(set(values))\n',
  recherche_binaire: 'def solve(values, target):\n    return values.index(target)\n',
  inversion: 'def solve(values):\n    return values[1:] + values[:1]\n',
  comptage_mots: 'def solve(text):\n    return len(text.split(""))\n'
};

export function buggyCodeFor(family: FamilyKey): string | undefined {
  return BUGGY[family];
}
