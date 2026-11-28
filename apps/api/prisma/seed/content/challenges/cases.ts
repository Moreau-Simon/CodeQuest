import type { FamilyKey, TestCaseSeed } from '../types';

interface GeneratedCase {
  input: unknown[];
  expected: unknown;
}

interface CaseFamily {
  /** Solution de référence Python, chiffrée avec la version du défi. */
  solution: string;
  generate(index: number): GeneratedCase;
}

function values(index: number, length = 5 + (index % 8)): number[] {
  return Array.from({ length }, (_unused, position) => (position * 17 + index * 13) % 97);
}

const PSEUDONYM_WORDS = [
  'radar',
  'kayak',
  'bonjour',
  'essere',
  'level',
  'chat',
  'rotor',
  'abcba',
  'bonsoir',
  'refer',
  'soleil',
  'stats',
  'radar',
  'xyz',
  'tacocat',
  'lunar'
] as const;

const PHRASES = [
  'Le tri fusion est stable',
  'un deux trois',
  'CodeQuest',
  'apprendre en pratiquant',
  'a b c',
  'la complexite lineaire',
  'python et javascript',
  '-un-deux-',
  'Calculer la mediane',
  'les tests caches',
  'une seule passe suffit',
  'racine carree',
  'tableau de valeurs',
  'defi resolution',
  'bonjour le monde',
  'a  b   c'
] as const;

const FAMILIES: Record<FamilyKey, CaseFamily> = {
  tri_croissant: {
    solution: 'def solve(values):\n    return sorted(values)\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: [...input].sort((a, b) => a - b) };
    }
  },
  tri_decroissant: {
    solution: 'def solve(values):\n    return sorted(values, reverse=True)\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: [...input].sort((a, b) => b - a) };
    }
  },
  inversion: {
    solution: 'def solve(values):\n    return values[::-1]\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: [...input].reverse() };
    }
  },
  somme: {
    solution: 'def solve(values):\n    return sum(values)\n',
    generate: (index) => {
      const input = values(index, 4 + (index % 7));
      return { input: [input], expected: input.reduce((total, value) => total + value, 0) };
    }
  },
  maximum: {
    solution: 'def solve(values):\n    return max(values)\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: Math.max(...input) };
    }
  },
  minimum: {
    solution: 'def solve(values):\n    return min(values)\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: Math.min(...input) };
    }
  },
  compte_paires: {
    solution: 'def solve(values):\n    return sum(1 for value in values if value % 2 == 0)\n',
    generate: (index) => {
      const input = values(index);
      return { input: [input], expected: input.filter((value) => value % 2 === 0).length };
    }
  },
  factorielle: {
    solution: [
      'def solve(number):',
      '    result = 1',
      '    for value in range(2, number + 1):',
      '        result *= value',
      '    return result',
      ''
    ].join('\n'),
    generate: (index) => {
      const number = 1 + (index % 8);
      let expected = 1;
      for (let value = 2; value <= number; value += 1) expected *= value;
      return { input: [number], expected };
    }
  },
  fibonacci: {
    solution: [
      'def solve(rank):',
      '    previous, current = 0, 1',
      '    for _unused in range(rank):',
      '        previous, current = current, previous + current',
      '    return previous',
      ''
    ].join('\n'),
    generate: (index) => {
      const rank = 1 + (index % 12);
      let previous = 0;
      let current = 1;
      for (let step = 0; step < rank; step += 1)
        [previous, current] = [current, previous + current];
      return { input: [rank], expected: previous };
    }
  },
  palindrome: {
    solution: 'def solve(text):\n    return text == text[::-1]\n',
    generate: (index) => {
      const word = PSEUDONYM_WORDS[index % PSEUDONYM_WORDS.length] ?? 'radar';
      return { input: [word], expected: word === [...word].reverse().join('') };
    }
  },
  valeurs_uniques: {
    solution: 'def solve(values):\n    return list(dict.fromkeys(values))\n',
    generate: (index) => {
      const input = Array.from(
        { length: 6 + (index % 6) },
        (_unused, position) => (position * 7 + index) % 5
      );
      return { input: [input], expected: [...new Set(input)] };
    }
  },
  somme_chiffres: {
    solution: 'def solve(number):\n    return sum(int(digit) for digit in str(number))\n',
    generate: (index) => {
      const number = 100 + index * 137;
      return {
        input: [number],
        expected: String(number)
          .split('')
          .reduce((total, digit) => total + Number(digit), 0)
      };
    }
  },
  pgcd: {
    solution: [
      'def solve(first, second):',
      '    while second:',
      '        first, second = second, first % second',
      '    return first',
      ''
    ].join('\n'),
    generate: (index) => {
      const first = 24 + index * 6;
      const second = 36 + index * 9;
      let a = first;
      let b = second;
      while (b !== 0) [a, b] = [b, a % b];
      return { input: [first, second], expected: a };
    }
  },
  fizzbuzz: {
    solution: [
      'def solve(number):',
      '    if number % 15 == 0:',
      '        return "FizzBuzz"',
      '    if number % 3 == 0:',
      '        return "Fizz"',
      '    if number % 5 == 0:',
      '        return "Buzz"',
      '    return str(number)',
      ''
    ].join('\n'),
    generate: (index) => {
      const number = index + 1;
      const expected =
        number % 15 === 0
          ? 'FizzBuzz'
          : number % 3 === 0
            ? 'Fizz'
            : number % 5 === 0
              ? 'Buzz'
              : String(number);
      return { input: [number], expected };
    }
  },
  recherche_binaire: {
    solution: [
      'def solve(values, target):',
      '    return values.index(target) if target in values else -1',
      ''
    ].join('\n'),
    generate: (index) => {
      const input = values(index, 9).sort((a, b) => a - b);
      const target = input[(index * 3) % input.length] ?? input[0] ?? 0;
      return { input: [input, target], expected: input.indexOf(target) };
    }
  },
  comptage_mots: {
    solution: 'def solve(text):\n    return len(text.split())\n',
    generate: (index) => {
      const phrase = PHRASES[index % PHRASES.length] ?? 'CodeQuest';
      return { input: [phrase], expected: phrase.trim().split(/\s+/).filter(Boolean).length };
    }
  }
};

/** Construit `count` cas reproductibles dont les `hiddenCount` derniers sont cachés. */
export function casesFor(family: FamilyKey, count: number, hiddenCount: number): TestCaseSeed[] {
  const generated = FAMILIES[family];
  const visible = count - hiddenCount;
  return Array.from({ length: count }, (_unused, index) => {
    const testCase = generated.generate(index);
    return { ...testCase, hidden: index >= visible, name: `cas-${index + 1}` };
  });
}

export function solutionFor(family: FamilyKey): string {
  return FAMILIES[family].solution;
}
