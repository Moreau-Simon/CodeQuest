import type { ThemeSeed } from './types';

/**
 * Dix provinces de la Grille. `algorithmes-de-tri` existe déjà dans le seed
 * historique : il est redéclaré ici pour rattacher la province au lore, sans
 * changer le titre ni le slug utilisés par les liens du front.
 */
export const THEMES: ThemeSeed[] = [
  {
    slug: 'algorithmes-de-tri',
    name: 'Algorithmes de tri',
    loreChapterSlug: 'les-fondations',
    sortOrder: 1
  },
  {
    slug: 'structures-de-donnees',
    name: 'Structures de données',
    loreChapterSlug: 'la-carte-des-regions',
    sortOrder: 2
  },
  {
    slug: 'complexite-et-performance',
    name: 'Complexité et performance',
    loreChapterSlug: 'le-temps-perdu',
    sortOrder: 3
  },
  { slug: 'debugging', name: 'Débogage', loreChapterSlug: 'le-jardin-des-erreurs', sortOrder: 4 },
  {
    slug: 'cryptographie',
    name: 'Cryptographie',
    loreChapterSlug: 'les-archives-chiffrees',
    sortOrder: 5
  },
  {
    slug: 'steganographie',
    name: 'Stéganographie',
    loreChapterSlug: 'le-message-cache',
    sortOrder: 6
  },
  {
    slug: 'automates-et-qr',
    name: 'Automates et codes QR',
    loreChapterSlug: 'le-protocole-etoile',
    sortOrder: 7
  },
  {
    slug: 'programmation-functionnelle',
    name: 'Programmation fonctionnelle',
    loreChapterSlug: 'la-boucle-infinie',
    sortOrder: 8
  },
  {
    slug: 'bases-de-donnees',
    name: 'Bases de données',
    loreChapterSlug: 'le-coeur-du-systeme',
    sortOrder: 9
  },
  {
    slug: 'concurrence',
    name: 'Concurrence et parallélisme',
    loreChapterSlug: 'ultime-compilation',
    sortOrder: 10
  }
];
