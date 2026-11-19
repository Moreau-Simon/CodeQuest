/**
 * Calcul des lignes modifiées côté navigateur (T147, FR-038).
 *
 * Même normalisation que `DiffService` côté API : indentation, espaces
 * internes et fins de ligne ignorés. Seules les lignes de code réellement
 * introduites ou remplacées sont surlignées.
 */

function normalize(line: string): string {
  return line.replace(/\r$/, '').replace(/\s+/g, '');
}

function lcs(before: string[], after: string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0)
  );
  for (let i = 1; i <= before.length; i += 1) {
    for (let j = 1; j <= after.length; j += 1) {
      table[i]![j] =
        before[i - 1] === after[j - 1]
          ? table[i - 1]![j - 1]! + 1
          : Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
    }
  }
  return table;
}

/** Numéros (1-indexés) des lignes de `current` absentes du code initial. */
export function modifiedLineNumbers(original: string, current: string): number[] {
  const before = original.split('\n').map(normalize);
  const after = current.split('\n').map(normalize);
  const table = lcs(before, after);

  const kept = new Set<number>();
  let i = before.length;
  let j = after.length;
  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      kept.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (table[i - 1]![j]! >= table[i]![j - 1]!) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return after.flatMap((_line, index) => (kept.has(index) ? [] : [index + 1]));
}
