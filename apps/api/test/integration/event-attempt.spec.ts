import { PrismaClient } from '@prisma/client';
import type { AttemptExpiryJob as AttemptExpiryJobType } from '../../src/modules/events/attempt-expiry.job';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T163 [P] [US9] (FR-062, FR-065) — écrit avant l'implémentation (constitution IV).
 *
 * - ouvrir la page / s'inscrire ne consomme pas l'essai ;
 * - seul `POST /events/{id}/start` le consomme, une seule fois ;
 * - hors fenêtre, le démarrage est refusé ;
 * - abandon / fermeture du navigateur ⇒ le job d'expiration consomme l'essai
 *   et aucune soumission n'est ensuite enregistrée.
 */
describe('US9 — essai unique d’événement (T163)', () => {
  const NOW = new Date('2030-06-15T10:00:00.000Z');
  const STARTS_AT = new Date('2030-06-15T09:00:00.000Z');
  const ENDS_AT = new Date('2030-06-15T11:00:00.000Z');

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let challengeId: string;
  let AttemptExpiryJobClass: typeof AttemptExpiryJobType;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    // Import après création de l'app : `src/config/env` est alors initialisé
    // avec les URLs des conteneurs, pas celles par défaut de `test/env.ts`.
    AttemptExpiryJobClass = (await import('../../src/modules/events/attempt-expiry.job'))
      .AttemptExpiryJob;
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    player = await createTestPlayer(api, prisma, 'event-player');
    const theme = await seedTheme(prisma, 'theme-event-attempt');
    const challenge = await seedChallenge(prisma, theme.id, 'Défi de l’événement');
    challengeId = challenge.id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(() => {
    clock.set(NOW);
  });

  async function seedEvent(slug: string): Promise<string> {
    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug,
        title: slug,
        timezone: 'Europe/Paris',
        startsAt: STARTS_AT,
        endsAt: ENDS_AT,
        status: 'open',
        type: 'standard',
        createdBy: player.id,
        challenges: { create: [{ challengeId, order: 1 }] }
      }
    });
    return event.id;
  }

  function participant(eventId: string) {
    return prisma.eventParticipant.findUniqueOrThrow({
      where: {
        eventId_subjectType_subjectId: {
          eventId,
          subjectType: 'player',
          subjectId: player.id
        }
      }
    });
  }

  it('n’ouvre aucun chrono et ne consomme pas l’essai à l’ouverture de la page', async () => {
    const eventId = await seedEvent('event-open-page');

    const join = await player.agent.post(`/api/v1/events/${eventId}/join`);
    expect(join.status).toBe(201);

    const listing = await player.agent.get('/api/v1/events');
    expect(listing.status).toBe(200);
    const view = (listing.body as Array<{ id: string; joined: boolean; attemptConsumed: boolean }>).find(
      (item) => item.id === eventId
    );
    expect(view).toMatchObject({ joined: true, attemptConsumed: false });

    const row = await participant(eventId);
    expect(row.attemptStartedAt).toBeNull();
    expect(row.attemptConsumedAt).toBeNull();
  });

  it('consomme l’essai au démarrage explicite et refuse un second démarrage', async () => {
    const eventId = await seedEvent('event-explicit-start');
    await player.agent.post(`/api/v1/events/${eventId}/join`);

    const start = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(start.status).toBe(200);

    const row = await participant(eventId);
    expect(row.attemptStartedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.attemptConsumedAt?.toISOString()).toBe(NOW.toISOString());

    const second = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ATTEMPT_ALREADY_CONSUMED');
  });

  it('refuse le démarrage hors de la fenêtre de l’événement', async () => {
    const eventId = await seedEvent('event-outside-window');
    await prisma.eventParticipant.create({
      data: {
        id: uuidv7(),
        eventId,
        subjectType: 'player',
        subjectId: player.id
      }
    });
    clock.set(new Date(STARTS_AT.getTime() - 1_000));

    const early = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('EVENT_CLOSED');
  });

  it('ne met pas l’essai en pause lors d’une déconnexion du navigateur', async () => {
    const eventId = await seedEvent('event-disconnect');
    await player.agent.post(`/api/v1/events/${eventId}/join`);

    // Le joueur ferme la page avant de confirmer : aucun « pause » n'est
    // prévu, la fenêtre serveur continue et le job clôt l'essai à ends_at.
    clock.set(new Date(ENDS_AT.getTime() + 1_000));
    await api.app.get(AttemptExpiryJobClass).sweep();

    const row = await participant(eventId);
    expect(row.attemptStartedAt).toBeNull();
    expect(row.attemptConsumedAt?.toISOString()).toBe(ENDS_AT.toISOString());

    const resume = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(resume.status).toBe(409);
    expect(resume.body.code).toBe('EVENT_CLOSED');
  });

  it('considère l’essai consommé après expiration et interdit toute reprise', async () => {
    const eventId = await seedEvent('event-abandon');
    await player.agent.post(`/api/v1/events/${eventId}/join`);
    await player.agent.post(`/api/v1/events/${eventId}/start`);

    // Le navigateur est fermé : le job atteint la fin de la fenêtre et clôt
    // l'essai, exactement comme une soumission abandonnée.
    clock.set(new Date(ENDS_AT.getTime() + 1_000));
    await api.app.get(AttemptExpiryJobClass).sweep();

    const row = await participant(eventId);
    expect(row.attemptConsumedAt).not.toBeNull();

    const submission = await player.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(1)', eventId });
    expect(submission.status).toBe(409);
    expect(submission.body.code).toBe('EVENT_CLOSED');
    expect(await prisma.submission.count({ where: { eventId } })).toBe(0);
  });
});
