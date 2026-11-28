import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';

/**
 * Seed pédagogique (US6) : deux leçons publiées avec mini-quiz.
 * Idempotent (identifié par `slug`), sans donnée personnelle.
 */
const LESSONS = [
  {
    slug: 'bases-des-tableaux',
    title: 'Les bases des tableaux',
    contentMd: [
      '# Les bases des tableaux',
      '',
      'Un tableau conserve une séquence d’éléments indexés à partir de 0.',
      'Parcourir un tableau avec `for value in values` permet d’en lire chaque élément.',
      '',
      '## À retenir',
      '',
      '- L’index commence à 0.',
      '- `len(values)` donne la taille.',
      '- Une copie évite de modifier le tableau d’origine.'
    ].join('\n'),
    order: 1,
    estimatedMinutes: 10,
    quiz: {
      passScore: 70,
      questions: [
        {
          id: 'q1',
          prompt: 'Quel est l’index du premier élément d’un tableau Python ?',
          choices: ['0', '1', '-1'],
          answerIndex: 0
        },
        {
          id: 'q2',
          prompt: 'Quelle fonction donne la taille d’un tableau ?',
          choices: ['size()', 'len()', 'count()'],
          answerIndex: 1
        }
      ]
    }
  },
  {
    slug: 'complexite-lineaire',
    title: 'Complexité linéaire',
    contentMd: [
      '# Complexité linéaire',
      '',
      'Un algorithme en **O(n)** traite chaque élément un nombre constant de fois.',
      'Un tri par insertion est en O(n²) dans le pire cas, alors qu’un tri fusion reste en O(n log n).',
      '',
      '## Exercice d’application',
      '',
      'Repérez, dans votre solution, la boucle qui domine le temps d’exécution.'
    ].join('\n'),
    order: 2,
    estimatedMinutes: 15,
    quiz: {
      passScore: 70,
      questions: [
        {
          id: 'q1',
          prompt: 'Quelle complexité décrit un simple parcours de tableau ?',
          choices: ['O(1)', 'O(n)', 'O(n²)'],
          answerIndex: 1
        },
        {
          id: 'q2',
          prompt: 'Quel tri reste en O(n log n) dans le pire cas ?',
          choices: ['Tri fusion', 'Tri à bulles', 'Tri par insertion'],
          answerIndex: 0
        }
      ]
    }
  }
] as const;

export async function seedLessons(prisma: PrismaClient): Promise<void> {
  const theme = await prisma.theme.findUnique({ where: { slug: 'algorithmes-de-tri' } });
  if (!theme) return; // Le seed des défis crée le thème ; rien à faire sans lui.

  for (const lesson of LESSONS) {
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: {},
      create: {
        id: uuidv7(),
        themeId: theme.id,
        slug: lesson.slug,
        title: lesson.title,
        contentMd: lesson.contentMd,
        order: lesson.order,
        estimatedMinutes: lesson.estimatedMinutes,
        status: 'published',
        quiz: lesson.quiz
      }
    });
  }
}
