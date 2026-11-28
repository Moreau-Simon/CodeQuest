import type { FamilyKey } from '../types';
import { casesFor } from './cases';

interface FamilyTemplate {
  objective: string;
  constraints: string;
  hints: readonly [string, string, string];
}

const TEMPLATES: Record<FamilyKey, FamilyTemplate> = {
  tri_croissant: {
    objective: 'Renvoyer la liste reçue triée par ordre croissant.',
    constraints: 'Aucun élément ne doit être perdu ni dupliqué. Visez une complexité O(n log n).',
    hints: [
      'Observez la relation entre la position d’un élément et sa valeur finale.',
      'Comparer deux éléments à la fois permet d’ordonner progressivement la liste.',
      'Un tri intégré du langage satisfait les contraintes de complexité.'
    ]
  },
  tri_decroissant: {
    objective: 'Renvoyer la liste reçue triée par ordre décroissant.',
    constraints: 'Conservez les doublons et trivialisez le cas d’une liste déjà ordonnée.',
    hints: [
      'Commencez par la plus grande valeur plutôt que la plus petite.',
      'Un tri croissant peut être inversé une seule fois à la fin.',
      'Les tris intégrés acceptent généralement un paramètre d’ordre inverse.'
    ]
  },
  inversion: {
    objective: 'Inverser l’ordre des éléments de la liste fournie.',
    constraints: 'La fonction doit renvoyer une nouvelle liste et ne pas modifier l’entrée.',
    hints: [
      'Le dernier élément devient le premier.',
      'Deux index qui se déplacent en sens opposé suffisent.',
      'Les langages modernes offrent une tranche pas-à-pas -1 ou équivalent.'
    ]
  },
  somme: {
    objective: 'Calculer la somme de tous les éléments de la liste.',
    constraints: 'La liste peut être vide : la somme est alors zéro.',
    hints: [
      'Parcourez la liste une seule fois.',
      'Initialisez un accumulateur à zéro avant la boucle.',
      'La plupart des langages proposent une fonction de réduction ou `sum`.'
    ]
  },
  maximum: {
    objective: 'Trouver la plus grande valeur de la liste.',
    constraints: 'La liste contient au moins un entier positif.',
    hints: [
      'Gardez en mémoire la meilleure valeur rencontrée.',
      'Initialisez avec le premier élément plutôt qu’avec zéro.',
      'Une fonction intégrée `max` règle le cas en une ligne.'
    ]
  },
  minimum: {
    objective: 'Trouver la plus petite valeur de la liste.',
    constraints: 'La liste contient au moins un entier positif.',
    hints: [
      'La valeur cherchée peut apparaître plusieurs fois.',
      'Comparez chaque élément au minimum courant.',
      'Une fonction intégrée `min` règle le cas en une ligne.'
    ]
  },
  compte_paires: {
    objective: 'Compter les nombres pairs de la liste.',
    constraints: 'Zéro est pair ; les nombres négatifs ne sont pas utilisés.',
    hints: [
      'Un nombre est pair lorsque son reste par deux est nul.',
      'Incrémentez un compteur seulement quand la condition est vraie.',
      'Une compréhension de liste filtrée puis comptée fonctionne aussi.'
    ]
  },
  factorielle: {
    objective: 'Calculer la factorielle du nombre fourni.',
    constraints: 'Le nombre est compris entre 1 et 8 ; aucun dépassement n’est attendu.',
    hints: [
      'La factorielle de 1 vaut 1.',
      'Multipliez le résultat courant par chaque entier jusqu’au nombre demandé.',
      'Une boucle `for` suffit, la récursion n’est pas nécessaire.'
    ]
  },
  fibonacci: {
    objective: 'Renvoyer le terme de Fibonacci d’ordre donné.',
    constraints: 'L’ordre est compris entre 1 et 12 ; le terme d’ordre 1 vaut 1.',
    hints: [
      'Conservez les deux derniers termes à chaque itération.',
      'Mettez à jour les deux variables en même temps pour éviter une temporaire.',
      'La suite commence par 1, 1, 2, 3, 5.'
    ]
  },
  palindrome: {
    objective: 'Déterminer si la chaîne fournie est un palindrome.',
    constraints: 'La comparaison est sensible à la casse et aux espaces.',
    hints: [
      'Un palindrome se lit identiquement dans les deux sens.',
      'Comparez la chaîne à sa version inversée.',
      'Une tranche avec un pas négatif ou `[::-1]` donne l’inversion.'
    ]
  },
  valeurs_uniques: {
    objective: 'Renvoyer les valeurs distinctes dans leur ordre de première apparition.',
    constraints: 'Les doublons sont supprimés sans trier le résultat.',
    hints: [
      'Deux valeurs égales ne doivent apparaître qu’une fois.',
      'Un ensemble permet de mémoriser les valeurs déjà vues.',
      'Un dictionnaire conserve l’ordre d’insertion dans les versions récentes de Python.'
    ]
  },
  somme_chiffres: {
    objective: 'Additionner les chiffres composant le nombre fourni.',
    constraints: 'Le nombre est positif et sa représentation décimale est complète.',
    hints: [
      'Convertissez le nombre en chaîne pour accéder à ses chiffres.',
      'Chaque caractère peut être converti en entier.',
      'Additionnez les valeurs au fur et à mesure de la lecture.'
    ]
  },
  pgcd: {
    objective: 'Calculer le plus grand commun diviseur de deux entiers.',
    constraints: 'Les deux nombres sont strictement positifs.',
    hints: [
      'Cherchez un diviseur commun plutôt que de tester toutes les valeurs.',
      'Le reste de la division euclidienne réduit le problème à chaque étape.',
      'L’algorithme d’Euclide se termine lorsque le reste vaut zéro.'
    ]
  },
  fizzbuzz: {
    objective: 'Appliquer la règle FizzBuzz au nombre fourni.',
    constraints: '« FizzBuzz » est prioritaire sur « Fizz » et « Buzz ».',
    hints: [
      'Testez d’abord la divisibilité par quinze.',
      'Un nombre divisible par trois mais pas par cinq renvoie « Fizz ».',
      'Dans tous les autres cas, renvoyez la représentation décimale du nombre.'
    ]
  },
  recherche_binaire: {
    objective:
      'Renvoyer l’index d’une valeur cible dans une liste triée, ou -1 si elle est absente.',
    constraints: 'La liste est déjà triée par ordre croissant.',
    hints: [
      'Comparez la cible à l’élément médian de l’intervalle.',
      'Réduisez l’intervalle de moitié à chaque comparaison.',
      'Une recherche linéaire fonctionne aussi mais coûte O(n).'
    ]
  },
  comptage_mots: {
    objective: 'Compter les mots de la chaîne fournie.',
    constraints: 'Les espaces répétés ne comptent pas comme des mots supplémentaires.',
    hints: [
      'Un mot est une suite de caractères séparée par des espaces.',
      'Supprimez les espaces en début et fin de chaîne.',
      'Une expression régulière `\\s+` découpe correctement la chaîne.'
    ]
  }
};

/** Énoncé complet, identique pour toutes les langues acceptées par le défi. */
export function statementFor(family: FamilyKey, context: string): string {
  const template = TEMPLATES[family];
  const example = casesFor(family, 1, 0)[0];
  return [
    '## Objectif',
    '',
    template.objective,
    '',
    context,
    '',
    '## Contraintes',
    '',
    template.constraints,
    '',
    'Écrivez une fonction `solve` respectant la signature indiquée.',
    '',
    '## Exemple',
    '',
    '```text',
    `entrée  : ${JSON.stringify(example?.input)}`,
    `sortie  : ${JSON.stringify(example?.expected)}`,
    '```',
    '',
    'Les tests cachés ne sont jamais exposés : seul leur nombre et un motif',
    'd’échec filtré vous sont communiqués.'
  ].join('\n');
}

/** Trois indices progressifs, jamais la solution et jamais de test caché. */
export function hintsFor(family: FamilyKey): readonly [string, string, string] {
  return TEMPLATES[family].hints;
}
