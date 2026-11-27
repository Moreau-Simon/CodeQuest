/**
 * Détection asynchrone de similarité (T255, FR-114).
 *
 * La normalisation est structurelle : commentaires, noms d'identifiants,
 * littéraux et mise en forme sont neutralisés avant comparaison des shingles.
 * Aucun résultat n'entraîne de sanction : le dossier est uniquement versé à
 * une file de revue humaine.
 */

export type SupportedLanguage = 'python' | 'javascript' | 'typescript';

const KEYWORDS = new Set([
  // Python
  'and',
  'as',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'elif',
  'else',
  'except',
  'False',
  'finally',
  'for',
  'from',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'None',
  'not',
  'or',
  'pass',
  'return',
  'True',
  'try',
  'while',
  'with',
  'yield',
  // JavaScript / TypeScript
  'const',
  'let',
  'var',
  'function',
  'new',
  'this',
  'typeof',
  'instanceof',
  'switch',
  'case',
  'default',
  'throw',
  'void'
]);

const MULTI_CHAR_TOKENS = ['=>', '==', '!=', '<=', '>=', '===', '!==', '+=', '-=', '*=', '/='];

function stripComments(code: string, language: SupportedLanguage): string {
  const withoutBlock = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const withoutSlash = withoutBlock.replace(/\/\/.*$/gm, ' ');
  return language === 'python' ? withoutSlash.replace(/#.*$/gm, ' ') : withoutSlash;
}

/**
 * Produit une suite de tokens où seuls les mots-clés et les opérateurs
 * structurels survivent. Deux programmes de même logique avec des noms
 * différents partagent ainsi la même représentation.
 */
export function normalizeCode(code: string, language: SupportedLanguage): string {
  const masked = stripComments(code, language)
    .replace(/'(?:\\.|[^'\\])*'/g, 'S')
    .replace(/"(?:\\.|[^"\\])*"/g, 'S')
    .replace(/`(?:\\.|[^`\\])*`/g, 'S')
    .replace(/\b\d+(?:\.\d+)?\b/g, 'N');

  const tokens: string[] = [];
  const pattern = new RegExp(`${MULTI_CHAR_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|[A-Za-z_$][\\w$]*|[^\\s]`, 'g');
  for (const match of masked.matchAll(pattern)) {
    const token = match[0];
    if (KEYWORDS.has(token)) tokens.push(token);
    else if (/^[A-Za-z_$]/.test(token)) tokens.push('I');
    else tokens.push(token);
  }
  return tokens.join(' ');
}

/** Découpe une représentation tokenisée en empreintes contiguës. */
export function shingles(text: string, size = 3): string[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= size) return [parts.join(' ')];
  const result: string[] = [];
  for (let index = 0; index <= parts.length - size; index += 1) {
    result.push(parts.slice(index, index + size).join(' '));
  }
  return result;
}

/** Indice de Jaccard sur les shingles, borné entre 0 et 1. */
export function jaccardSimilarity(a: string, b: string, shingleSize = 3): number {
  const left = new Set(shingles(a, shingleSize));
  const right = new Set(shingles(b, shingleSize));
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const shingle of left) if (right.has(shingle)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarityFinding {
  readonly score: number;
  readonly suspicious: boolean;
  readonly evidence: string;
  readonly review: 'human';
}

export interface SimilarityOptions {
  readonly threshold?: number;
  readonly shingleSize?: number;
}

/**
 * Compare deux soumissions. Le résultat est un simple signal : la sanction
 * éventuelle reste toujours décidée par un humain (FR-114).
 */
export function detectSimilarity(
  codeA: string,
  codeB: string,
  language: SupportedLanguage,
  options: SimilarityOptions = {}
): SimilarityFinding {
  const threshold = options.threshold ?? 0.8;
  const left = normalizeCode(codeA, language);
  const right = normalizeCode(codeB, language);
  const score = jaccardSimilarity(left, right, options.shingleSize ?? 3);

  return {
    score,
    suspicious: score >= threshold,
    evidence: left.slice(0, 500),
    review: 'human'
  };
}
