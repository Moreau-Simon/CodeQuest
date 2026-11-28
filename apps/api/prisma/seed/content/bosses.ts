import type { BossSeed } from './types';

/**
 * Quatre boss de fin d'arc. Les parts de barre totalisent exactement 100 par
 * boss : le total n'est pas contrôlé par le SQL, donc la garde unitaire le fait.
 */
export const BOSSES: BossSeed[] = [
  {
    slug: 'gardien-des-fondations',
    name: 'Le gardien des fondations',
    loreChapterSlug: 'les-fondations',
    maxHp: 900,
    rewards: { bits: 300 },
    phases: [
      {
        order: 1,
        challengeSlug: 'boss-fondations-1',
        hpShare: 40,
        damageRule: { per_100_score: 5, failureCost: 15 }
      },
      {
        order: 2,
        challengeSlug: 'boss-fondations-2',
        hpShare: 35,
        damageRule: { per_100_score: 5, failureCost: 15 }
      },
      {
        order: 3,
        challengeSlug: 'boss-fondations-3',
        hpShare: 25,
        damageRule: { per_100_score: 6, failureCost: 15 }
      }
    ]
  },
  {
    slug: 'boucle-infinie',
    name: 'La boucle infinie',
    loreChapterSlug: 'la-boucle-infinie',
    maxHp: 1_200,
    rewards: { bits: 450 },
    phases: [
      {
        order: 1,
        challengeSlug: 'boss-boucle-1',
        hpShare: 35,
        damageRule: { per_100_score: 5, failureCost: 15 }
      },
      {
        order: 2,
        challengeSlug: 'boss-boucle-2',
        hpShare: 35,
        damageRule: { per_100_score: 5, failureCost: 18 }
      },
      {
        order: 3,
        challengeSlug: 'boss-boucle-3',
        hpShare: 30,
        damageRule: { per_100_score: 6, failureCost: 18 }
      }
    ]
  },
  {
    slug: 'archives-chiffrees',
    name: 'Les archives chiffrées',
    loreChapterSlug: 'les-archives-chiffrees',
    maxHp: 1_500,
    rewards: { bits: 600 },
    phases: [
      {
        order: 1,
        challengeSlug: 'boss-archives-1',
        hpShare: 30,
        damageRule: { per_100_score: 5, failureCost: 15 }
      },
      {
        order: 2,
        challengeSlug: 'boss-archives-2',
        hpShare: 35,
        damageRule: { per_100_score: 5, failureCost: 18 }
      },
      {
        order: 3,
        challengeSlug: 'boss-archives-3',
        hpShare: 35,
        damageRule: { per_100_score: 6, failureCost: 18 }
      }
    ]
  },
  {
    slug: 'compilation-finale',
    name: 'La compilation finale',
    loreChapterSlug: 'ultime-compilation',
    maxHp: 2_000,
    rewards: { bits: 1_000 },
    phases: [
      {
        order: 1,
        challengeSlug: 'boss-final-1',
        hpShare: 25,
        damageRule: { per_100_score: 5, failureCost: 15 }
      },
      {
        order: 2,
        challengeSlug: 'boss-final-2',
        hpShare: 35,
        damageRule: { per_100_score: 6, failureCost: 18 }
      },
      {
        order: 3,
        challengeSlug: 'boss-final-3',
        hpShare: 40,
        damageRule: { per_100_score: 7, failureCost: 20 }
      }
    ]
  }
];
