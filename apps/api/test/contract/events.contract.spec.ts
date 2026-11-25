import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { expectValidResponse, type Operation } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T165 [P] [US9] — contrat `/events/*` conforme à `contracts/openapi.yaml`.
 * Écrit avant l'implémentation (constitution IV).
 */
describe('contrat /events/* (T165)', () => {
  const NOW = new Date('2030-09-01T12:00:00.000Z');
  const STARTS_AT = new Date('2030-09-01T11:00:00.000Z');
  const ENDS_AT = new Date('2030-09-01T13:00:00.000Z');

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let eventId: string;
  let challengeId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    // Import différé : `env` est déjà initialisé avec les URLs des conteneurs.
    const { AesGcmService } = await import('../../src/common/crypto/aes-gcm.service');
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    player = await createTestPlayer(api, prisma, 'contract-player');
    const theme = await seedTheme(prisma, 'theme-event-contract');
    const challenge = await seedChallenge(prisma, theme.id, 'Défi événement contrat');
    challengeId = challenge.id;

    const aes = new AesGcmService();
    await prisma.challengeVersion.update({
      where: { id: challenge.versionId },
      data: {
        referenceSolutionEncrypted: Uint8Array.from(
          aes.encrypt('def solve(x):\n    return x', challenge.versionId)
        )
      }
    });

    const event = await prisma.event.create({
      data: {
        id: uuidv7(),
        slug: 'event-contrat',
        title: 'Événement contrat',
        timezone: 'Europe/Paris',
        startsAt: STARTS_AT,
        endsAt: ENDS_AT,
        status: 'open',
        type: 'standard',
        createdBy: player.id,
        challenges: { create: [{ challengeId, order: 1 }] }
      }
    });
    eventId = event.id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  function expectValid(operation: Operation, status: number, body: unknown): void {
    expectValidResponse(operation, status, body);
  }

  it('GET /events renvoie des événements conformes au schéma Event', async () => {
    const response = await api.anonymous.get('/api/v1/events');
    expect(response.status).toBe(200);
    expectValid({ method: 'get', path: '/events' }, 200, response.body);

    const item = (response.body as Array<{ id: string }>).find((entry) => entry.id === eventId);
    expect(item).toBeDefined();
  });

  it('POST /events/{id}/join puis /start sont conformes au contrat', async () => {
    const join = await player.agent.post(`/api/v1/events/${eventId}/join`);
    expect(join.status).toBe(201);
    expectValid({ method: 'post', path: '/events/{eventId}/join' }, 201, join.body);

    const start = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(start.status).toBe(200);
    expectValid({ method: 'post', path: '/events/{eventId}/start' }, 200, start.body);

    const conflict = await player.agent.post(`/api/v1/events/${eventId}/start`);
    expect(conflict.status).toBe(409);
    expectValid({ method: 'post', path: '/events/{eventId}/start' }, 409, conflict.body);
  });

  it('les résultats et le corrigé ne sont conformes qu’après clôture', async () => {
    const locked = await player.agent.get(`/api/v1/events/${eventId}/results`);
    expect(locked.status).toBe(403);
    expectValid({ method: 'get', path: '/events/{eventId}/results' }, 403, locked.body);

    clock.set(new Date(ENDS_AT.getTime() + 1_000));
    await prisma.event.update({ where: { id: eventId }, data: { status: 'finished' } });

    const results = await player.agent.get(`/api/v1/events/${eventId}/results`);
    expect(results.status).toBe(200);
    expectValid({ method: 'get', path: '/events/{eventId}/results' }, 200, results.body);
    expect(results.body.published).toBe(true);
    expect(results.body.solutions).toEqual([{ challengeId, unlocked: true }]);

    const solution = await player.agent.get(
      `/api/v1/events/${eventId}/challenges/${challengeId}/solution`
    );
    expect(solution.status).toBe(200);
    expectValid(
      { method: 'get', path: '/events/{eventId}/challenges/{challengeId}/solution' },
      200,
      solution.body
    );
    expect(solution.body.solution).toBe('def solve(x):\n    return x');
  });
});
