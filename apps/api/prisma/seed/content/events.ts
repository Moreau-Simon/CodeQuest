import type { EventSeed, SeasonSeed } from './types';

const UTC = (date: string, time: string): string => `${date}T${time}:00.000Z`;

/**
 * Quatre saisons contiguës : les fenêtres ne se chevauchent pas, ce que la
 * garde unitaire vérifie. Les dates sont fixes pour que le seed soit rejouable.
 */
export const SEASONS: SeasonSeed[] = [
  {
    slug: 'saison-1-veillee',
    name: 'Saison 1 — La veillée',
    startsAt: UTC('2026-01-01', '00:00'),
    endsAt: UTC('2026-03-31', '23:59')
  },
  {
    slug: 'saison-2-signal',
    name: 'Saison 2 — Le signal',
    startsAt: UTC('2026-04-01', '00:00'),
    endsAt: UTC('2026-06-30', '23:59')
  },
  {
    slug: 'saison-3-archives',
    name: 'Saison 3 — Les archives',
    startsAt: UTC('2026-07-01', '00:00'),
    endsAt: UTC('2026-09-30', '23:59')
  },
  {
    slug: 'saison-4-compilation',
    name: 'Saison 4 — La compilation',
    startsAt: UTC('2026-10-01', '00:00'),
    endsAt: UTC('2026-12-31', '23:59')
  }
];

/** Huit événements, dont trois battle royales synchronisées. */
export const EVENTS: EventSeed[] = [
  {
    slug: 'tournoi-des-fondations',
    title: 'Tournoi des fondations',
    timezone: 'Europe/Paris',
    startsAt: UTC('2026-02-14', '09:00'),
    endsAt: UTC('2026-02-14', '18:00'),
    status: 'finished',
    type: 'standard',
    maxAttempts: 1,
    minParticipants: 8,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 200, places: 8 },
    challengeSlugs: ['event-sprint-tri', 'event-somme-eclair', 'event-fibonacci'],
    rounds: []
  },
  {
    slug: 'nuit-du-debogage',
    title: 'Nuit du débogage',
    timezone: 'Europe/Paris',
    startsAt: UTC('2026-05-23', '20:00'),
    endsAt: UTC('2026-05-24', '02:00'),
    status: 'finished',
    type: 'standard',
    maxAttempts: 1,
    minParticipants: 12,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 250, places: 10 },
    challengeSlugs: ['event-debug-extreme', 'event-palindrome', 'recherche-binaire'],
    rounds: []
  },
  {
    slug: 'defi-des-archives',
    title: 'Défi des archives',
    timezone: 'Europe/London',
    startsAt: UTC('2026-08-12', '08:00'),
    endsAt: UTC('2026-08-12', '20:00'),
    status: 'finished',
    type: 'standard',
    maxAttempts: 1,
    minParticipants: 8,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 300, places: 12 },
    challengeSlugs: ['event-chiffre-cache', 'cle-miroir', 'event-lsb-cache'],
    rounds: []
  },
  {
    slug: 'royale-des-fondations',
    title: 'Royale des fondations',
    timezone: 'Europe/Paris',
    startsAt: UTC('2026-03-28', '10:00'),
    endsAt: UTC('2026-03-28', '12:00'),
    status: 'finished',
    type: 'battle_royale',
    maxAttempts: 1,
    minParticipants: 16,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 400, places: 8 },
    challengeSlugs: ['event-sprint-tri', 'event-somme-eclair', 'event-fibonacci'],
    rounds: [
      {
        roundNumber: 1,
        challengeSlug: 'event-sprint-tri',
        startsAt: UTC('2026-03-28', '10:00'),
        endsAt: UTC('2026-03-28', '10:40'),
        status: 'closed'
      },
      {
        roundNumber: 2,
        challengeSlug: 'event-somme-eclair',
        startsAt: UTC('2026-03-28', '10:45'),
        endsAt: UTC('2026-03-28', '11:25'),
        status: 'closed'
      },
      {
        roundNumber: 3,
        challengeSlug: 'event-fibonacci',
        startsAt: UTC('2026-03-28', '11:30'),
        endsAt: UTC('2026-03-28', '12:00'),
        status: 'closed'
      }
    ]
  },
  {
    slug: 'royale-de-la-boucle',
    title: 'Royale de la boucle infinie',
    timezone: 'Europe/Paris',
    startsAt: UTC('2026-12-05', '14:00'),
    endsAt: UTC('2026-12-05', '17:00'),
    status: 'scheduled',
    type: 'battle_royale',
    maxAttempts: 1,
    minParticipants: 16,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 500, places: 8 },
    challengeSlugs: ['event-debug-extreme', 'event-fibonacci', 'event-palindrome'],
    rounds: [
      {
        roundNumber: 1,
        challengeSlug: 'event-fibonacci',
        startsAt: UTC('2026-12-05', '14:00'),
        endsAt: UTC('2026-12-05', '14:50'),
        status: 'scheduled'
      },
      {
        roundNumber: 2,
        challengeSlug: 'event-debug-extreme',
        startsAt: UTC('2026-12-05', '15:00'),
        endsAt: UTC('2026-12-05', '15:50'),
        status: 'scheduled'
      },
      {
        roundNumber: 3,
        challengeSlug: 'event-palindrome',
        startsAt: UTC('2026-12-05', '16:00'),
        endsAt: UTC('2026-12-05', '17:00'),
        status: 'scheduled'
      }
    ]
  },
  {
    slug: 'sprint-de-la-grille',
    title: 'Sprint de la Grille',
    timezone: 'Europe/London',
    startsAt: UTC('2026-12-12', '09:00'),
    endsAt: UTC('2026-12-12', '18:00'),
    status: 'scheduled',
    type: 'standard',
    maxAttempts: 1,
    minParticipants: 8,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 320, places: 10 },
    challengeSlugs: ['event-sprint-tri', 'event-qr-flash', 'event-somme-eclair', 'event-final'],
    rounds: []
  },
  {
    slug: 'championnat-des-symboles',
    title: 'Championnat des symboles',
    timezone: 'Europe/Paris',
    startsAt: UTC('2026-12-19', '10:00'),
    endsAt: UTC('2026-12-19', '16:00'),
    status: 'scheduled',
    type: 'standard',
    maxAttempts: 1,
    minParticipants: 12,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 350, places: 12 },
    challengeSlugs: ['event-qr-flash', 'recherche-symbole', 'event-recherche'],
    rounds: []
  },
  {
    slug: 'finale-de-la-compilation',
    title: 'Finale de la compilation',
    timezone: 'Europe/London',
    startsAt: UTC('2027-01-16', '13:00'),
    endsAt: UTC('2027-01-16', '18:00'),
    status: 'scheduled',
    type: 'battle_royale',
    maxAttempts: 1,
    minParticipants: 16,
    eliminationRule: { threshold: 50, percent: 10 },
    rewards: { bits: 800, places: 8 },
    challengeSlugs: ['event-final', 'event-recherche', 'event-palindrome', 'event-debug-extreme'],
    rounds: [
      {
        roundNumber: 1,
        challengeSlug: 'event-palindrome',
        startsAt: UTC('2027-01-16', '13:00'),
        endsAt: UTC('2027-01-16', '14:00'),
        status: 'scheduled'
      },
      {
        roundNumber: 2,
        challengeSlug: 'event-debug-extreme',
        startsAt: UTC('2027-01-16', '14:10'),
        endsAt: UTC('2027-01-16', '15:10'),
        status: 'scheduled'
      },
      {
        roundNumber: 3,
        challengeSlug: 'event-recherche',
        startsAt: UTC('2027-01-16', '15:20'),
        endsAt: UTC('2027-01-16', '16:20'),
        status: 'scheduled'
      },
      {
        roundNumber: 4,
        challengeSlug: 'event-final',
        startsAt: UTC('2027-01-16', '16:30'),
        endsAt: UTC('2027-01-16', '18:00'),
        status: 'scheduled'
      }
    ]
  }
];
