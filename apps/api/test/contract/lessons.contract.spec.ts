import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { contractValidator, expectValidResponse } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T131 [P] [US6] Tests de contrat `/lessons/*` conformes à `contracts/openapi.yaml`.
 * - Catalogue et détail (quiz sans réponses correctes)
 * - Mini-quiz et complétion (comptes confirmés)
 * - Statistiques SC-010 et erreurs 403/404 motivées
 */
describe('contrat /lessons/* (T131)', () => {
  const validator = contractValidator();
  const password = 'correct-horse-battery-staple';
  const email = 'lessons.contract@example.com';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let themeId: string;
  let lessonId: string;
  let answers: Record<string, number>;

  const quiz = {
    passScore: 70,
    questions: [
      { id: 'q1', prompt: 'Premier index ?', choices: ['0', '1'], answerIndex: 0 },
      { id: 'q2', prompt: 'Taille ?', choices: ['len()', 'size()'], answerIndex: 0 }
    ]
  };

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym: 'lessons-contract', password });
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });

    themeId = uuidv7();
    await prisma.theme.create({ data: { id: themeId, slug: 'contrat-lecons', name: 'Cours' } });

    lessonId = uuidv7();
    await prisma.lesson.create({
      data: {
        id: lessonId,
        themeId,
        slug: 'contrat-lecon',
        title: 'Leçon de contrat',
        contentMd: '# Leçon\n\nContenu.',
        order: 1,
        status: 'published',
        quiz
      }
    });
    answers = { q1: 0, q2: 0 };
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('expose GET /lessons et GET /lessons/{id} conformes au contrat', async () => {
    const list = await api.anonymous.get('/api/v1/lessons');
    expect(list.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/lessons' }, 200, list.body);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: lessonId })]));

    const detail = await api.anonymous.get(`/api/v1/lessons/${lessonId}`);
    expect(detail.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/lessons/{lessonId}' }, 200, detail.body);
    expect(detail.body.id).toBe(lessonId);
    expect(detail.body.quiz.questions).toHaveLength(2);
    expect(detail.body.quiz.questions[0]).not.toHaveProperty('answerIndex');
  });

  it('renvoie 404 conforme pour une leçon inexistante', async () => {
    const response = await api.anonymous.get(`/api/v1/lessons/${uuidv7()}`);
    expect(response.status).toBe(404);
    const result = validator.validateResponse({ method: 'get', path: '/lessons/{lessonId}' }, 404, response.body);
    if (!result.valid) throw new Error(result.errors.join('\n'));
  });

  it('note le mini-quiz et expose GET /lessons/metrics/first-attempt', async () => {
    const quiz = await api.agent.post(`/api/v1/lessons/${lessonId}/quiz`).send({ answers });
    expect(quiz.status).toBe(200);
    expectValidResponse({ method: 'post', path: '/lessons/{lessonId}/quiz' }, 200, quiz.body);
    expect(quiz.body).toMatchObject({ passed: true, score: 100, correct: 2, total: 2 });

    const metrics = await api.anonymous.get('/api/v1/lessons/metrics/first-attempt');
    expect(metrics.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/lessons/metrics/first-attempt' }, 200, metrics.body);
    expect(metrics.body).toEqual(
      expect.objectContaining({ attempts: expect.any(Number), successes: expect.any(Number), rate: expect.any(Number) })
    );
  });

  it('termine la leçon et renvoie la progression conforme au contrat', async () => {
    const response = await api.agent.post(`/api/v1/lessons/${lessonId}/complete`).send({ quizScore: 100 });
    expect(response.status).toBe(200);
    expectValidResponse({ method: 'post', path: '/lessons/{lessonId}/complete' }, 200, response.body);
    expect(response.body).toMatchObject({ lessonId, status: 'completed', quizScore: 100 });

    const detail = await api.agent.get(`/api/v1/lessons/${lessonId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.progress).toEqual(
      expect.objectContaining({ status: 'completed', quizScore: 100 })
    );
  });

  it('ne propose plus de route de positionnement', async () => {
    const response = await api.agent.post(`/api/v1/lessons/${lessonId}/positioning`).send({ answers });
    expect(response.status).toBe(404);
  });

  it('refuse une auto-déclaration de score sans tentative de quiz', async () => {
    const thirdLessonId = uuidv7();
    await prisma.lesson.create({
      data: {
        id: thirdLessonId,
        themeId,
        slug: 'contrat-quiz-requis',
        title: 'Quiz obligatoire',
        contentMd: '# Quiz',
        order: 3,
        status: 'published',
        quiz
      }
    });
    const declared = await api.agent
      .post(`/api/v1/lessons/${thirdLessonId}/complete`)
      .send({ quizScore: 100 });
    expect(declared.status).toBe(403);
  });

  it('exige un compte confirmé pour écrire sa progression', async () => {
    const anonymous = await api.anonymous.post(`/api/v1/lessons/${lessonId}/quiz`).send({ answers });
    expect(anonymous.status).toBe(401);
  });
});
