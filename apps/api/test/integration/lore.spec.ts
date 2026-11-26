import { PrismaClient } from '@prisma/client';
import { FrozenClock } from '../helpers/clock';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { expectValidResponse } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { uuidv7 } from '../../src/common/uuid';
import { XpService } from '../../src/modules/lessons/xp.service';

/** T197 [P] [US12] : déblocage par progression et persistance de lecture (FR-078). */
describe('lore — progression et lecture (T197)', () => {
  const password = 'correct-horse-battery-staple';
  const email = 'lore.integration@example.com';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let userId: string;
  let firstChapterId: string;
  let lockedChapterId: string;

  beforeAll(async () => {
    const clock = new FrozenClock(new Date('2030-08-01T10:00:00.000Z'));
    infra = await startTestInfrastructure();
    api = await createTestApp(infra, { clock });
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym: 'lore-int', password });
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;

    firstChapterId = uuidv7();
    await prisma.loreChapter.create({
      data: {
        id: firstChapterId,
        slug: 'lore-premier',
        title: 'Premier chapitre',
        contentMd: '# Premiers pas',
        audioKey: 'regions/forest',
        requiredLevel: 1,
        order: 1
      }
    });
    lockedChapterId = uuidv7();
    await prisma.loreChapter.create({
      data: {
        id: lockedChapterId,
        slug: 'lore-verrouille',
        title: 'Chapitre verrouillé',
        contentMd: '# Secret encore masqué',
        requiredLevel: 3,
        order: 2
      }
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('débloque les chapitres par niveau sans révéler le contenu verrouillé', async () => {
    const award = await api.app.get(XpService).awardForChallenge({
      userId,
      challengeId: uuidv7(),
      score: 150
    });
    expect(award.level).toBe(2);

    const anonymous = await api.anonymous.get('/api/v1/lore/chapters');
    expect(anonymous.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/lore/chapters' }, 200, anonymous.body);
    expect(anonymous.body.find((chapter: { id: string }) => chapter.id === firstChapterId)).toEqual(
      expect.objectContaining({ unlocked: false, read: false })
    );
    expect(
      anonymous.body.find((chapter: { id: string }) => chapter.id === firstChapterId)
    ).not.toHaveProperty('content');

    const response = await api.agent.get('/api/v1/lore/chapters');
    expect(response.status).toBe(200);
    const first = response.body.find((chapter: { id: string }) => chapter.id === firstChapterId);
    const locked = response.body.find((chapter: { id: string }) => chapter.id === lockedChapterId);
    expect(first).toEqual(
      expect.objectContaining({
        slug: 'lore-premier',
        requiredLevel: 1,
        order: 1,
        audioKey: 'regions/forest',
        unlocked: true,
        read: false
      })
    );
    expect(first.content).toContain('Premiers pas');
    expect(locked).toEqual(expect.objectContaining({ unlocked: false, read: false }));
    expect(locked).not.toHaveProperty('content');
  });

  it('persiste l’état de lecture de façon idempotente', async () => {
    const read = await api.agent.post(`/api/v1/lore/chapters/${firstChapterId}/read`).send({});
    expect(read.status).toBe(200);
    expectValidResponse(
      { method: 'post', path: '/lore/chapters/{chapterId}/read' },
      200,
      read.body
    );
    expect(read.body).toEqual(
      expect.objectContaining({ id: firstChapterId, unlocked: true, read: true })
    );
    expect(read.body.readAt).toEqual(expect.any(String));

    const stored = await prisma.loreProgress.findUniqueOrThrow({
      where: { userId_chapterId: { userId, chapterId: firstChapterId } }
    });
    expect(stored.readAt).not.toBeNull();

    const replay = await api.agent.post(`/api/v1/lore/chapters/${firstChapterId}/read`).send({});
    expect(replay.status).toBe(200);
    expect(replay.body.readAt).toBe(read.body.readAt);

    const reloaded = await api.agent.get('/api/v1/lore/chapters');
    const first = reloaded.body.find((chapter: { id: string }) => chapter.id === firstChapterId);
    expect(first.read).toBe(true);
    expect(first.readAt).toBe(read.body.readAt);
  });

  it('refuse de marquer comme lu un chapitre verrouillé ou sans session', async () => {
    const locked = await api.agent.post(`/api/v1/lore/chapters/${lockedChapterId}/read`).send({});
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('LORE_CHAPTER_LOCKED');
    expect(
      await prisma.loreProgress.findUnique({
        where: { userId_chapterId: { userId, chapterId: lockedChapterId } }
      })
    ).toBeNull();

    const anonymous = await api.anonymous
      .post(`/api/v1/lore/chapters/${firstChapterId}/read`)
      .send({});
    expect(anonymous.status).toBe(401);
  });

  it('autorise un compte non confirmé à lire le lore public (FR-003)', async () => {
    const pendingEmail = 'lore-pending@example.com';
    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: pendingEmail, pseudonym: 'lore-pending', password });
    const login = await api.anonymous
      .post('/api/v1/auth/login')
      .send({ identifier: pendingEmail, password });
    expect(login.status).toBe(200);

    const list = await api.anonymous.get('/api/v1/lore/chapters');
    expect(list.status).toBe(200);
    const first = list.body.find((chapter: { id: string }) => chapter.id === firstChapterId);
    expect(first.unlocked).toBe(true);
    expect(first.content).toContain('Premiers pas');

    const read = await api.anonymous.post(`/api/v1/lore/chapters/${firstChapterId}/read`).send({});
    expect(read.status).toBe(403);
    expect(read.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
