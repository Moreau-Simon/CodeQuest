import type { ShopItemSeed } from '../types';

/**
 * Trente-quatre objets non compétitifs (FR-076) : seuls les types autorisés
 * par `ShopService` apparaissent ici. Les objets `hint` référencent un indice
 * réel, résolu en `metadata.hintId` au moment du seed.
 */
export const SHOP_ITEMS: ShopItemSeed[] = [
  {
    sku: 'potion.hp.25',
    name: 'Fiole de réparation mineure',
    kind: 'potion',
    priceBits: 60,
    isActive: true,
    metadata: { hp_restore: 25 }
  },
  {
    sku: 'potion.hp.50',
    name: 'Fiole de réparation',
    kind: 'potion',
    priceBits: 110,
    isActive: true,
    metadata: { hp_restore: 50 }
  },
  {
    sku: 'potion.hp.75',
    name: 'Fiole de réparation majeure',
    kind: 'potion',
    priceBits: 170,
    isActive: true,
    metadata: { hp_restore: 75 }
  },
  {
    sku: 'potion.hp.100',
    name: 'Élixir de régénération',
    kind: 'potion',
    priceBits: 240,
    isActive: true,
    metadata: { hp_restore: 100 }
  },
  {
    sku: 'potion.streak.1',
    name: 'Saude de série',
    kind: 'potion',
    priceBits: 90,
    isActive: true,
    metadata: { streak_protection: 1 }
  },
  {
    sku: 'potion.attempt.1',
    name: 'Essai supplémentaire d’entraînement',
    kind: 'potion',
    priceBits: 130,
    isActive: true,
    metadata: { practice_attempt: 1 }
  },

  {
    sku: 'avatar.explorateur',
    name: 'Avatar — Explorateur',
    kind: 'avatar',
    priceBits: 150,
    isActive: true,
    metadata: { avatar_key: 'avatar.explorateur' }
  },
  {
    sku: 'avatar.archiviste',
    name: 'Avatar — Archiviste',
    kind: 'avatar',
    priceBits: 180,
    isActive: true,
    metadata: { avatar_key: 'avatar.archiviste' }
  },
  {
    sku: 'avatar.debugueur',
    name: 'Avatar — Débogueur',
    kind: 'avatar',
    priceBits: 210,
    isActive: true,
    metadata: { avatar_key: 'avatar.debugueur' }
  },
  {
    sku: 'avatar.cryptographe',
    name: 'Avatar — Cryptographe',
    kind: 'avatar',
    priceBits: 240,
    isActive: true,
    metadata: { avatar_key: 'avatar.cryptographe' }
  },
  {
    sku: 'avatar.gardien',
    name: 'Avatar — Gardien',
    kind: 'avatar',
    priceBits: 320,
    isActive: true,
    metadata: { avatar_key: 'avatar.gardien' }
  },
  {
    sku: 'avatar.compilateur',
    name: 'Avatar — Compilateur',
    kind: 'avatar',
    priceBits: 400,
    isActive: true,
    metadata: { avatar_key: 'avatar.compilateur' }
  },

  {
    sku: 'title.debutant',
    name: 'Titre — Débutant de la Grille',
    kind: 'title',
    priceBits: 120,
    isActive: true,
    metadata: { title_key: 'debutant' }
  },
  {
    sku: 'title.trieur',
    name: 'Titre — Maître du tri',
    kind: 'title',
    priceBits: 180,
    isActive: true,
    metadata: { title_key: 'trieur' }
  },
  {
    sku: 'title.debugueur',
    name: 'Titre — Chasseur de bugs',
    kind: 'title',
    priceBits: 200,
    isActive: true,
    metadata: { title_key: 'debugueur' }
  },
  {
    sku: 'title.cryptographe',
    name: 'Titre — Lecteur d’archives',
    kind: 'title',
    priceBits: 250,
    isActive: true,
    metadata: { title_key: 'cryptographe' }
  },
  {
    sku: 'title.vainqueur',
    name: 'Titre — Vainqueur de royale',
    kind: 'title',
    priceBits: 320,
    isActive: true,
    metadata: { title_key: 'vainqueur' }
  },
  {
    sku: 'title.architecte',
    name: 'Titre — Architecte de la compilation',
    kind: 'title',
    priceBits: 480,
    isActive: true,
    metadata: { title_key: 'architecte' }
  },

  {
    sku: 'theme.editor.nuit',
    name: 'Thème d’éditeur — Nuit',
    kind: 'editor_theme',
    priceBits: 200,
    isActive: true,
    metadata: { theme_key: 'nuit' }
  },
  {
    sku: 'theme.editor.archive',
    name: 'Thème d’éditeur — Archive',
    kind: 'editor_theme',
    priceBits: 220,
    isActive: true,
    metadata: { theme_key: 'archive' }
  },
  {
    sku: 'theme.editor.forest',
    name: 'Thème d’éditeur — Forêt',
    kind: 'editor_theme',
    priceBits: 240,
    isActive: true,
    metadata: { theme_key: 'foret' }
  },
  {
    sku: 'theme.editor.neon',
    name: 'Thème d’éditeur — Néon',
    kind: 'editor_theme',
    priceBits: 280,
    isActive: true,
    metadata: { theme_key: 'neon' }
  },
  {
    sku: 'theme.editor.cuivre',
    name: 'Thème d’éditeur — Cuivre',
    kind: 'editor_theme',
    priceBits: 340,
    isActive: true,
    metadata: { theme_key: 'cuivre' }
  },
  {
    sku: 'theme.editor.compilation',
    name: 'Thème d’éditeur — Compilation',
    kind: 'editor_theme',
    priceBits: 420,
    isActive: true,
    metadata: { theme_key: 'compilation' }
  },

  {
    sku: 'access.saison.2',
    name: 'Accès anticipé — Saison 2',
    kind: 'early_access',
    priceBits: 800,
    isActive: true,
    metadata: { season: 'saison-2-signal' }
  },
  {
    sku: 'access.saison.3',
    name: 'Accès anticipé — Saison 3',
    kind: 'early_access',
    priceBits: 900,
    isActive: true,
    metadata: { season: 'saison-3-archives' }
  },
  {
    sku: 'access.saison.4',
    name: 'Accès anticipé — Saison 4',
    kind: 'early_access',
    priceBits: 1_000,
    isActive: true,
    metadata: { season: 'saison-4-compilation' }
  },
  {
    sku: 'access.royale.boucle',
    name: 'Accès anticipé — Royale de la boucle',
    kind: 'early_access',
    priceBits: 1_200,
    isActive: true,
    metadata: { event: 'royale-de-la-boucle' }
  },

  {
    sku: 'hint.somme',
    name: 'Indice — Vérifier la somme',
    kind: 'hint',
    priceBits: 40,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'somme-des-valeurs', order: 1 }
  },
  {
    sku: 'hint.palindrome',
    name: 'Indice — Palindrome miroir',
    kind: 'hint',
    priceBits: 60,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'palindrome-miroir', order: 2 }
  },
  {
    sku: 'hint.cle-miroir',
    name: 'Indice — Clé miroir',
    kind: 'hint',
    priceBits: 70,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'cle-miroir', order: 1 }
  },
  {
    sku: 'hint.lsb',
    name: 'Indice — Canal LSB',
    kind: 'hint',
    priceBits: 90,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'bits-poids-faible', order: 3 }
  },
  {
    sku: 'hint.fizzbuzz',
    name: 'Indice — Modules FizzBuzz',
    kind: 'hint',
    priceBits: 50,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'fizzbuzz-qr', order: 1 }
  },
  {
    sku: 'hint.final',
    name: 'Indice — Message de compilation',
    kind: 'hint',
    priceBits: 140,
    isActive: true,
    metadata: {},
    hintRef: { challengeSlug: 'boss-final-2', order: 2 }
  }
];
