import { Injectable } from '@nestjs/common';

/**
 * Comptage des lignes modifiées entre un code de départ et une soumission
 * (T143, FR-038). La comparaison est **normalisée** : indentation, espaces
 * internes, fins de ligne et lignes vides sont ignorés, afin de ne pénaliser
 * que les changements de code réels et non le style de l'apprenant.
 */
@Injectable()
export class DiffService {
  countModifiedLines(original: string, submitted: string): number {
    const before = this.normalizedLines(original);
    const after = this.normalizedLines(submitted);
    const lcs = this.lcsLength(before, after);

    // Une ligne remplacée compte une fois : on retient le plus grand nombre de
    // lignes introduites ou retirées hors du plus long sous-séquence commun.
    return Math.max(before.length - lcs, after.length - lcs);
  }

  private normalizedLines(code: string): string[] {
    return code
      .split('\n')
      .map((line) => line.replace(/\r$/, '').replace(/\s+/g, ''))
      .filter((line) => line.length > 0);
  }

  /** Longueur du plus long sous-séquence commun (programmation dynamique). */
  private lcsLength(before: string[], after: string[]): number {
    const rows = before.length;
    const columns = after.length;
    if (rows === 0 || columns === 0) return 0;

    const dp: number[][] = Array.from({ length: rows + 1 }, () =>
      new Array<number>(columns + 1).fill(0)
    );

    for (let i = 1; i <= rows; i += 1) {
      for (let j = 1; j <= columns; j += 1) {
        dp[i]![j] =
          before[i - 1] === after[j - 1]
            ? dp[i - 1]![j - 1]! + 1
            : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }

    return dp[rows]![columns]!;
  }
}
