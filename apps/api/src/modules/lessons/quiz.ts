import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Format JSON stocké dans `lessons.quiz` (data-model.md §2).
 * Ce banc sert uniquement au mini-quiz pédagogique (FR-051).
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

export interface QuizBank {
  passScore: number;
  questions: QuizQuestion[];
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

/** Valide et normalise le banc de questions d'une leçon. */
export function parseQuizBank(value: Prisma.JsonValue | null | undefined): QuizBank | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const passScore = raw.passScore === undefined ? 70 : raw.passScore;
  if (!Number.isFinite(passScore) || (passScore as number) < 0 || (passScore as number) > 100) {
    invalid('Le seuil de réussite du quiz doit être compris entre 0 et 100');
  }

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    invalid('questions doit contenir au moins une question');
  }
  const questions = raw.questions.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      invalid(`questions[${index}] est invalide`);
    }
    const question = entry as Record<string, unknown>;
    if (typeof question.id !== 'string' || !question.id) invalid(`questions[${index}].id est requis`);
    if (typeof question.prompt !== 'string' || !question.prompt) {
      invalid(`questions[${index}].prompt est requis`);
    }
    if (
      !Array.isArray(question.choices) ||
      question.choices.length < 2 ||
      !question.choices.every((choice) => typeof choice === 'string')
    ) {
      invalid(`questions[${index}].choices doit contenir au moins deux réponses`);
    }
    if (
      !Number.isInteger(question.answerIndex) ||
      (question.answerIndex as number) < 0 ||
      (question.answerIndex as number) >= question.choices.length
    ) {
      invalid(`questions[${index}].answerIndex est hors bornes`);
    }
    return {
      id: question.id,
      prompt: question.prompt,
      choices: question.choices as string[],
      answerIndex: question.answerIndex as number
    };
  });

  return { passScore: passScore as number, questions };
}

/** Questions exposées au client, sans les réponses correctes. */
export function publicQuiz(test: QuizBank): PublicQuiz {
  return {
    passScore: test.passScore,
    questions: test.questions.map(({ id, prompt, choices }) => ({ id, prompt, choices: [...choices] }))
  };
}

/** Note le banc de questions. Une réponse absente est comptée comme fausse. */
export function gradeQuiz(test: QuizBank, answers: QuizAnswers): QuizGrade {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    invalid('Les réponses doivent être un objet indexé par identifiant de question');
  }
  const correct = test.questions.reduce((total, question) => {
    const answer = answers[question.id];
    return total + (Number.isInteger(answer) && answer === question.answerIndex ? 1 : 0);
  }, 0);
  const total = test.questions.length;
  const score = Math.round((correct / total) * 100);
  return { score, correct, total, passed: score >= test.passScore };
}
