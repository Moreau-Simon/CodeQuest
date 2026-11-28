import type { BadgeSeed } from '../types';

/**
 * Vingt succès configurés. Les trois critères sont ceux réellement évalués par
 * `BadgesService` ; `bits` est la récompense unique versée à l'attribution.
 */
export const BADGES: BadgeSeed[] = [
  {
    key: 'first-pass',
    name: 'Premier signal',
    description: 'Validez votre première soumission sur la Grille.',
    criteria: { kind: 'passed_submissions_at_least', value: 1, bits: 20 }
  },
  {
    key: 'ten-passes',
    name: 'Dix signaux',
    description: 'Dix soumissions validées en solo.',
    criteria: { kind: 'passed_submissions_at_least', value: 10, bits: 60 }
  },
  {
    key: 'fifty-passes',
    name: 'Cinquante signaux',
    description: 'Cinquante soumissions validées en solo.',
    criteria: { kind: 'passed_submissions_at_least', value: 50, bits: 150 }
  },
  {
    key: 'hundred-passes',
    name: 'Cent signaux',
    description: 'Cent soumissions validées en solo.',
    criteria: { kind: 'passed_submissions_at_least', value: 100, bits: 300 }
  },
  {
    key: 'score-300',
    name: 'Première empreinte',
    description: 'Obtenez un meilleur score d’au moins 300 points.',
    criteria: { kind: 'best_score_at_least', value: 300, bits: 30 }
  },
  {
    key: 'score-450',
    name: 'Empreinte nette',
    description: 'Obtenez un meilleur score d’au moins 450 points.',
    criteria: { kind: 'best_score_at_least', value: 450, bits: 60 }
  },
  {
    key: 'score-600',
    name: 'Empreinte durable',
    description: 'Obtenez un meilleur score d’au moins 600 points.',
    criteria: { kind: 'best_score_at_least', value: 600, bits: 100 }
  },
  {
    key: 'score-800',
    name: 'Empreinte exceptionnelle',
    description: 'Obtenez un meilleur score d’au moins 800 points.',
    criteria: { kind: 'best_score_at_least', value: 800, bits: 180 }
  },
  {
    key: 'score-1000',
    name: 'Empreinte légendaire',
    description: 'Obtenez un meilleur score d’au moins 1000 points.',
    criteria: { kind: 'best_score_at_least', value: 1000, bits: 300 }
  },
  {
    key: 'boss-first',
    name: 'Premier gardien',
    description: 'Vainquez votre premier boss de chapitre.',
    criteria: { kind: 'boss_defeats_at_least', value: 1, bits: 120 }
  },
  {
    key: 'boss-two',
    name: 'Deux gardiens',
    description: 'Vainquez deux boss de chapitre.',
    criteria: { kind: 'boss_defeats_at_least', value: 2, bits: 240 }
  },
  {
    key: 'boss-three',
    name: 'Trois gardiens',
    description: 'Vainquez trois boss de chapitre.',
    criteria: { kind: 'boss_defeats_at_least', value: 3, bits: 380 }
  },
  {
    key: 'boss-all',
    name: 'Compilation achevée',
    description: 'Vainquez les quatre boss de la Grille.',
    criteria: { kind: 'boss_defeats_at_least', value: 4, bits: 600 }
  },
  {
    key: 'sort-adept',
    name: 'Adepte du tri',
    description: 'Validez cinquante soumissions de tri.',
    criteria: { kind: 'passed_submissions_at_least', value: 25, bits: 90 }
  },
  {
    key: 'debug-adept',
    name: 'Adepte du débogage',
    description: 'Validez vingt-cinq corrections de bugs.',
    criteria: { kind: 'passed_submissions_at_least', value: 30, bits: 110 }
  },
  {
    key: 'archive-reader',
    name: 'Lecteur d’archives',
    description: 'Validez quarante épreuves de décryptage ou de stéganographie.',
    criteria: { kind: 'passed_submissions_at_least', value: 40, bits: 160 }
  },
  {
    key: 'symbol-reader',
    name: 'Lecteur de symboles',
    description: 'Validez trente-cinq épreuves de codes QR.',
    criteria: { kind: 'passed_submissions_at_least', value: 35, bits: 140 }
  },
  {
    key: 'marathon',
    name: 'Marathon de la Grille',
    description: 'Validez deux cents soumissions au total.',
    criteria: { kind: 'passed_submissions_at_least', value: 200, bits: 700 }
  },
  {
    key: 'perfection',
    name: 'Perfection',
    description: 'Atteignez un meilleur score d’au moins 1200 points.',
    criteria: { kind: 'best_score_at_least', value: 1200, bits: 500 }
  },
  {
    key: 'survivor',
    name: 'Survivant de la compilation',
    description: 'Vainquez cinq boss au total.',
    criteria: { kind: 'boss_defeats_at_least', value: 5, bits: 800 }
  }
];
