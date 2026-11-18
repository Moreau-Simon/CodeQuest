import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Format JSON stocké dans `lessons.positioning_test` (data-model.md §2).
 * Le même banc de questions sert au mini-quiz de la leçon (FR-051) et au test
 * de positionnement (FR-052) ; `quiz` permet de surcharger le mini-quiz.
 *
 * Les réponses correctes ne quittent jamais l'API : `publicQuiz()` retire
 * `answerIndex` avant sérialisation.
 */
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
}

export interface PositioningTest {
  passScore: number;
  questions: QuizQuestion[];
  quiz?: QuizQuestion[];
}

export interface PublicQuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

export interface PublicQuiz {
  passScore: number;
  questions: PublicQuizQuestion[];
}

export type QuizAnswers = Record<string, number>;

export interface QuizGrade {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

function invalid(message: string): never {
  throw new BadRequestException({ code: 'LESSON_QUIZ_INVALID', message });
}

/** Valide et normalise le JSON du banc de questions d'une leçon. */
export function parsePositioningTest(value: Prisma.JsonValue | null | undefined): PositioningTest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const passScore = raw.passScore === undefined ? 70 : raw.passScore;
  if (!Number.isFinite(passScore) || (passScore as number) < 0 || (passScore as number) > 100) {
    invalid('Le seuil de réussite du quiz doit être compris entre 0 et 100');
  }

  const parseQuestions = (input: unknown, field: string): QuizQuestion[] => {
    if (!Array.isArray(input) || input.length === 0) invalid(`${field} doit contenir au moins une question`);
    return input.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        invalid(`${field}[${index}] est invalide`);
      }
      const question = entry as Record<string, unknown>;
      if (typeof question.id !== 'string' || !question.id) invalid(`${field}[${index}].id est requis`);
      if (typeof question.prompt !== 'string' || !question.prompt) {
        invalid(`${field}[${index}].prompt est requis`);
      }
      if (
        !Array.isArray(question.choices) ||
        question.choices.length < 2 ||
        !question.choices.every((choice) => typeof choice === 'string')
      ) {
        invalid(`${field}[${index}].choices doit contenir au moins deux réponses`);
      }
      if (
        !Number.isInteger(question.answerIndex) ||
        (question.answerIndex as number) < 0 ||
        (question.answerIndex as number) >= question.choices.length
      ) {
        invalid(`${field}[${index}].answerIndex est hors bornes`);
      }
      return {
        id: question.id,
        prompt: question.prompt,
        choices: question.choices as string[],
        answerIndex: question.answerIndex as number
      };
    });
  };

  return {
    passScore: passScore as number,
    questions: parseQuestions(raw.questions, 'questions'),
    ...(raw.quiz === undefined ? {} : { quiz: parseQuestions(raw.quiz, 'quiz') })
  };
}

/** Questions exposées au client, sans les réponses correctes. */
export function publicQuiz(test: PositioningTest, kind: 'quiz' | 'positioning' = 'quiz'): PublicQuiz {
  const questions = kind === 'quiz' && test.quiz ? test.quiz : test.questions;
  return {
    passScore: test.passScore,
    questions: questions.map(({ id, prompt, choices }) => ({ id, prompt, choices: [...choices] }))
  };
}

/** Note un banc de questions. Une réponse absente est comptée comme fausse. */
export function gradeQuiz(test: PositioningTest, answers: QuizAnswers, kind: 'quiz' | 'positioning'): QuizGrade {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    invalid('Les réponses doivent être un objet indexé par identifiant de question');
  }
  const questions = kind === 'quiz' && test.quiz ? test.quiz : test.questions;
  const correct = questions.reduce((total, question) => {
    const answer = answers[question.id];
    return total + (Number.isInteger(answer) && answer === question.answerIndex ? 1 : 0);
  }, 0);
  const total = questions.length;
  const score = Math.round((correct / total) * 100);
  return { score, correct, total, passed: score >= test.passScore };
}
