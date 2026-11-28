import type { ChallengeDefinition, ChallengeTypeSeed, FamilyKey } from '../types';
import { buggyCodeFor } from './buggy';
import { solutionFor } from './cases';

interface ChallengeInput {
  slug: string;
  title: string;
  themeSlug: string;
  type?: ChallengeTypeSeed;
  difficulty: number;
  family: FamilyKey;
  context: string;
  caseCount?: number;
  hiddenCount?: number;
  isEventOnly?: boolean;
  isBossPhase?: boolean;
  cipher?: string;
  keySeedRef?: string;
}

const DEFAULT_CASE_COUNT = 16;
const DEFAULT_HIDDEN_COUNT = 6;

/** Barème cohérent avec `data-model.md` : 100 points et 20 bits par niveau. */
function define(input: ChallengeInput): ChallengeDefinition {
  const type = input.type ?? 'sorting';
  const family = input.family;
  const definition: ChallengeDefinition = {
    slug: input.slug,
    title: input.title,
    themeSlug: input.themeSlug,
    type,
    difficulty: input.difficulty,
    family,
    context: input.context,
    languages: ['python', 'javascript'],
    caseCount: input.caseCount ?? DEFAULT_CASE_COUNT,
    hiddenCount: input.hiddenCount ?? DEFAULT_HIDDEN_COUNT,
    basePoints: 100 * input.difficulty,
    perfMax: 20 * input.difficulty,
    tOptMs: 40 * input.difficulty,
    tMaxMs: 1_000 * input.difficulty,
    isEventOnly: input.isEventOnly ?? false,
    isBossPhase: input.isBossPhase ?? false
  };
  if (type === 'debugging') {
    const buggy = buggyCodeFor(family);
    if (!buggy) throw new Error(`Aucun code bogué défini pour ${family} (${input.slug})`);
    definition.buggyCode = buggy;
    definition.maxModifiedLines = 4;
  }
  if (type === 'decryption') {
    definition.cipher = input.cipher ?? 'xor';
    definition.keySeedRef = input.keySeedRef ?? `seed://archives/${input.slug}`;
  }
  // La contrainte SQL `challenges_cipher_check` n'autorise que les chiffrements
  // xor/caesar/vigenere : la stéganographie et les QR n'en utilisent aucun.
  // Garde locale : une famille sans solution de référence ne peut pas être seedée.
  if (!solutionFor(family)) throw new Error(`Solution manquante pour ${family}`);
  return definition;
}

/** Trente défis du parcours permanent, trois par province. */
export const CORE_CHALLENGES: ChallengeDefinition[] = [
  define({
    slug: 'tri-croissant-court',
    title: 'Ordonner une courte séquence',
    themeSlug: 'algorithmes-de-tri',
    type: 'sorting',
    difficulty: 1,
    family: 'tri_croissant',
    context: 'La plaque de cuivre du premier chapitre contient une courte séquence.'
  }),
  define({
    slug: 'tri-decroissant-inventaire',
    title: 'Classer un inventaire à l’envers',
    themeSlug: 'algorithmes-de-tri',
    type: 'sorting',
    difficulty: 2,
    family: 'tri_decroissant',
    context: 'L’intendant veut voir les objets les plus précieux en premier.'
  }),
  define({
    slug: 'inversion-de-file',
    title: 'Inverser une file de signal',
    themeSlug: 'algorithmes-de-tri',
    type: 'sorting',
    difficulty: 2,
    family: 'inversion',
    context: 'Le signal doit être relu de la fin vers le début.'
  }),
  define({
    slug: 'somme-des-valeurs',
    title: 'Vérifier la somme des valeurs',
    themeSlug: 'structures-de-donnees',
    type: 'debugging',
    difficulty: 1,
    family: 'somme',
    context: 'Le total affiché par la salle circulaire est faux : corrigez le calcul.'
  }),
  define({
    slug: 'maximum-du-tableau',
    title: 'Repérer la valeur maximale',
    themeSlug: 'structures-de-donnees',
    difficulty: 2,
    family: 'maximum',
    context: 'La carte des régions met en évidence la province la plus étendue.'
  }),
  define({
    slug: 'compte-paires',
    title: 'Compter les signaux pairs',
    themeSlug: 'structures-de-donnees',
    type: 'debugging',
    difficulty: 2,
    family: 'compte_paires',
    context: 'Un automate compte de travers : seuls les signaux pairs doivent être retenus.'
  }),
  define({
    slug: 'factorielle-rapide',
    title: 'Calculer une factorielle',
    themeSlug: 'complexite-et-performance',
    difficulty: 2,
    family: 'factorielle',
    context: 'L’horloge de la salle de calcul attend une factorielle exacte.'
  }),
  define({
    slug: 'fibonacci-memoire',
    title: 'Suite de Fibonacci sans mémoire perdue',
    themeSlug: 'complexite-et-performance',
    type: 'debugging',
    difficulty: 3,
    family: 'fibonacci',
    context: 'La boucle infinie rejoue une suite dont les deux derniers termes sont confondus.'
  }),
  define({
    slug: 'somme-chiffres',
    title: 'Additionner les chiffres d’un cachet',
    themeSlug: 'complexite-et-performance',
    difficulty: 3,
    family: 'somme_chiffres',
    context: 'Chaque cachet porte un nombre dont la somme des chiffres est la clé de passage.'
  }),
  define({
    slug: 'palindrome-miroir',
    title: 'Reconnaître un palindrome',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 2,
    family: 'palindrome',
    context: 'Une inscription du jardin se lit mal : la comparaison omet le dernier caractère.'
  }),
  define({
    slug: 'valeurs-uniques',
    title: 'Dedupliquer sans réordonner',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 3,
    family: 'valeurs_uniques',
    context: 'Le jardinier veut effacer les doublons sans perdre l’ordre d’apparition.'
  }),
  define({
    slug: 'recherche-binaire',
    title: 'Retrouver un index dans une liste triée',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 3,
    family: 'recherche_binaire',
    context: 'La recherche échoue quand la cible est absente : renvoyez alors -1.'
  }),
  define({
    slug: 'dechiffrement-cesar',
    title: 'Compter les mots d’un message chiffré',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 2,
    family: 'comptage_mots',
    context: 'Avant de décaler les lettres, l’archiviste vérifie la longueur du message.',
    cipher: 'caesar'
  }),
  define({
    slug: 'cle-miroir',
    title: 'Extraire les symboles uniques d’une clé',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 3,
    family: 'valeurs_uniques',
    context: 'La clé miroir répète ses symboles : ne conservez que la première occurrence.'
  }),
  define({
    slug: 'module-pgcd',
    title: 'Réduire un module par le PGCD',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 3,
    family: 'pgcd',
    context: 'Deux longueurs de grilles sont fournies ; leur PGCD donne le pas commun.'
  }),
  define({
    slug: 'bits-poids-faible',
    title: 'Isoler les signaux pairs d’un pixel',
    themeSlug: 'steganographie',
    type: 'steganography',
    difficulty: 3,
    family: 'compte_paires',
    context: 'La fresque nocturne encode ses bits dans les valeurs paires.'
  }),
  define({
    slug: 'canal-bleu',
    title: 'Trouver l’intensité maximale du canal bleu',
    themeSlug: 'steganographie',
    type: 'steganography',
    difficulty: 3,
    family: 'maximum',
    context: 'Le message se cache dans la valeur bleue la plus élevée de la bande.'
  }),
  define({
    slug: 'image-suspecte',
    title: 'Vérifier le motif d’une image',
    themeSlug: 'steganographie',
    type: 'steganography',
    difficulty: 4,
    family: 'palindrome',
    context: 'Une bande de pixels se lit comme une phrase palindrome ou falsifiée.'
  }),
  define({
    slug: 'fizzbuzz-qr',
    title: 'Étiqueter les modules d’un QR',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 2,
    family: 'fizzbuzz',
    context: 'Les modules obéissent à la règle FizzBuzz avant lecture optique.'
  }),
  define({
    slug: 'recherche-symbole',
    title: 'Localiser un symbole dans la grille',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 3,
    family: 'recherche_binaire',
    context: 'La grille est ordonnée : retrouvez la position du symbole demandé.'
  }),
  define({
    slug: 'integrite-qr',
    title: 'Additionner les valeurs de contrôle',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 3,
    family: 'somme',
    context: 'La somme des valeurs de contrôle doit correspondre à l’empreinte annoncée.'
  }),
  define({
    slug: 'reduction-liste',
    title: 'Réduire une liste de signaux',
    themeSlug: 'programmation-functionnelle',
    difficulty: 2,
    family: 'somme',
    context: 'Une fonction pure combine les signaux reçus en une seule valeur.'
  }),
  define({
    slug: 'cartographie-paire',
    title: 'Cartographier puis filtrer',
    themeSlug: 'programmation-functionnelle',
    difficulty: 2,
    family: 'compte_paires',
    context: 'La transformation doit rester sans effet de bord sur la liste source.'
  }),
  define({
    slug: 'immutabilite-unique',
    title: 'Construire une collection immuable',
    themeSlug: 'programmation-functionnelle',
    difficulty: 3,
    family: 'valeurs_uniques',
    context: 'La nouvelle collection conserve l’ordre sans modifier l’originale.'
  }),
  define({
    slug: 'index-pgcd',
    title: 'Aligner deux index par leur PGCD',
    themeSlug: 'bases-de-donnees',
    difficulty: 3,
    family: 'pgcd',
    context: 'Deux colonnes d’index doivent être alignées sur leur diviseur commun.'
  }),
  define({
    slug: 'transaction-minimum',
    title: 'Valider le solde minimum',
    themeSlug: 'bases-de-donnees',
    difficulty: 3,
    family: 'minimum',
    context: 'Le ledger doit refuser toute écriture sous le seuil autorisé.'
  }),
  define({
    slug: 'tri-par-date',
    title: 'Ordonner les écritures par date',
    themeSlug: 'bases-de-donnees',
    difficulty: 4,
    family: 'tri_croissant',
    context: 'Le moteur restitue les transactions dans leur ordre chronologique.'
  }),
  define({
    slug: 'files-attente',
    title: 'Inverser une file d’attente',
    themeSlug: 'concurrence',
    type: 'debugging',
    difficulty: 4,
    family: 'inversion',
    context: 'Le runner traite les essais dans l’ordre inverse de leur arrivée par erreur.'
  }),
  define({
    slug: 'section-critique',
    title: 'Choisir la valeur critique maximale',
    themeSlug: 'concurrence',
    type: 'debugging',
    difficulty: 4,
    family: 'maximum',
    context: 'Deux accès concurrents renvoient la mauvaise valeur : corrigez la comparaison.'
  }),
  define({
    slug: 'verdict-concurrent',
    title: 'Consolider les verdicts concurrents',
    themeSlug: 'concurrence',
    type: 'debugging',
    difficulty: 4,
    family: 'somme',
    context: 'Un verdict sur deux est oublié lors de la consolidation.'
  })
];

/** Dix défis réservés aux événements (jamais dans le catalogue permanent). */
export const EVENT_CHALLENGES: ChallengeDefinition[] = [
  define({
    slug: 'event-sprint-tri',
    title: 'Sprint de tri chronométré',
    themeSlug: 'algorithmes-de-tri',
    difficulty: 3,
    family: 'tri_croissant',
    context: 'Trois minutes pour ordonner la séquence de la manche.',
    isEventOnly: true
  }),
  define({
    slug: 'event-somme-eclair',
    title: 'Somme éclair',
    themeSlug: 'structures-de-donnees',
    difficulty: 3,
    family: 'somme',
    context: 'Le total doit être exact avant la fermeture de la fenêtre.',
    isEventOnly: true
  }),
  define({
    slug: 'event-debug-extreme',
    title: 'Débogage en temps limité',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 4,
    family: 'valeurs_uniques',
    context: 'Un seul essai est autorisé pour corriger la collection.',
    isEventOnly: true
  }),
  define({
    slug: 'event-chiffre-cache',
    title: 'Grille de chiffrement inconnue',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 4,
    family: 'pgcd',
    context: 'Le pas de la grille doit être trouvé avant la fin de l’épreuve.',
    isEventOnly: true
  }),
  define({
    slug: 'event-lsb-cache',
    title: 'Canal LSB sous pression',
    themeSlug: 'steganographie',
    type: 'steganography',
    difficulty: 4,
    family: 'compte_paires',
    context: 'Chaque pixel lu coûte du temps : ne gardez que les valeurs paires.',
    isEventOnly: true
  }),
  define({
    slug: 'event-qr-flash',
    title: 'QR flash',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 4,
    family: 'fizzbuzz',
    context: 'Le symbole change à chaque tour : appliquez la règle sans hésiter.',
    isEventOnly: true
  }),
  define({
    slug: 'event-fibonacci',
    title: 'Fibonacci contre la montre',
    themeSlug: 'complexite-et-performance',
    type: 'debugging',
    difficulty: 4,
    family: 'fibonacci',
    context: 'La suite doit être corrigée en une seule soumission.',
    isEventOnly: true
  }),
  define({
    slug: 'event-palindrome',
    title: 'Palindrome surprises',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 5,
    family: 'palindrome',
    context: 'Les mots cachés changent à chaque manche.',
    isEventOnly: true
  }),
  define({
    slug: 'event-recherche',
    title: 'Recherche binaire éliminatoire',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 5,
    family: 'recherche_binaire',
    context: 'Une mauvaise position élimine immédiatement le participant.',
    isEventOnly: true
  }),
  define({
    slug: 'event-final',
    title: 'Épreuve finale des archives',
    themeSlug: 'concurrence',
    difficulty: 5,
    family: 'somme_chiffres',
    context: 'La dernière manche additionne tous les acquis de la saison.',
    isEventOnly: true
  })
];

/** Douze défis de phase, trois par boss. */
export const BOSS_CHALLENGES: ChallengeDefinition[] = [
  define({
    slug: 'boss-fondations-1',
    title: 'Phase I — Tri des fondations',
    themeSlug: 'algorithmes-de-tri',
    type: 'debugging',
    difficulty: 3,
    family: 'tri_croissant',
    context: 'Le gardien renvoie les plaques désordonnées.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-fondations-2',
    title: 'Phase II — Total des fondations',
    themeSlug: 'structures-de-donnees',
    type: 'debugging',
    difficulty: 4,
    family: 'somme',
    context: 'La somme des sigles doit être corrigée pour fissurer la carapace.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-fondations-3',
    title: 'Phase III — Pic des fondations',
    themeSlug: 'structures-de-donnees',
    difficulty: 4,
    family: 'maximum',
    context: 'Le dernier coup porte sur la valeur la plus élevée.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-boucle-1',
    title: 'Phase I — Suite de la boucle',
    themeSlug: 'complexite-et-performance',
    type: 'debugging',
    difficulty: 4,
    family: 'fibonacci',
    context: 'La boucle infinie tourne à vide ; rétablissez la suite.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-boucle-2',
    title: 'Phase II — Index de la boucle',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 5,
    family: 'recherche_binaire',
    context: 'La cible se cache dans une liste triée de grande taille.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-boucle-3',
    title: 'Phase III — Renversement de la boucle',
    themeSlug: 'programmation-functionnelle',
    difficulty: 5,
    family: 'inversion',
    context: 'La boucle doit être relue dans l’autre sens pour se refermer.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-archives-1',
    title: 'Phase I — Cle miroir',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 4,
    family: 'valeurs_uniques',
    context: 'Le miroir renvoie des symboles répétés.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-archives-2',
    title: 'Phase II — Module des archives',
    themeSlug: 'cryptographie',
    type: 'decryption',
    difficulty: 5,
    family: 'pgcd',
    context: 'La grille de chiffrement révèle son pas commun.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-archives-3',
    title: 'Phase III — Motif caché',
    themeSlug: 'steganographie',
    type: 'steganography',
    difficulty: 5,
    family: 'palindrome',
    context: 'Le boss cache son point faible dans une bande de pixels.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-final-1',
    title: 'Phase I — Protocole Étoile',
    themeSlug: 'automates-et-qr',
    type: 'qr_code',
    difficulty: 5,
    family: 'fizzbuzz',
    context: 'La première phase valide l’étiquetage des modules.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-final-2',
    title: 'Phase II — Message de compilation',
    themeSlug: 'debugging',
    type: 'debugging',
    difficulty: 5,
    family: 'comptage_mots',
    context: 'Le message final mal découpé doit être corrigé.',
    isBossPhase: true
  }),
  define({
    slug: 'boss-final-3',
    title: 'Phase III — Ultime compilation',
    themeSlug: 'concurrence',
    difficulty: 5,
    family: 'comptage_mots',
    context: 'La dernière porte ne s’ouvre qu’après un comptage exact.',
    isBossPhase: true
  })
];

export const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  ...CORE_CHALLENGES,
  ...EVENT_CHALLENGES,
  ...BOSS_CHALLENGES
];
