import { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/common/auth/authenticated-user';
import type { EventsService as EventsServiceType } from '../../src/modules/events/events.service';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T164 [P] [US9] (FR-061, FR-062) — écrit avant l'implémentation (constitution IV).
 *
 * - fuseau IANA validé, fenêtre exprimée en instants UTC, traversée de l'heure d'été ;
 * - soumission strictement avant `ends_at` acceptée avec priorité de file 1 ;
 * - soumission exactement à `ends_at` refusée, sans aucune écriture.
 */
describe('US9 — frontières temporelles des événements (T164)', () => {
  const DST_START = new Date('2026-03-29T00:30:00.000Z'); // 01:30 CET
  const DST_END = new Date('2026-03-29T02:30:00.000Z'); // 04:30 CEST après le saut

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let admin: AuthenticatedUser;
  let challengeId: string;
  let events: EventsServiceType;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(new Date('2026-03-29T01:00:00.000Z'));
    api = await createTestApp(infra, { clock });
    // Import différé : `src/config/env` doit d'abord lire les URLs des conteneurs.
    const { EventsService } = await import('../../src/modules/events/events.service');
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    player = await createTestPlayer(api, prisma, 'boundary-player');
    admin = {
      id: player.id,
      pseudonym: player.pseudonym,
      status: 'active',
      roles: ['admin'],
      permissions: new Set(['challenge:write'])
    };
    const theme = await seedTheme(prisma, 'theme-event-boundary');
    challengeId = (await seedChallenge(prisma, theme.id, 'Défi aux frontières')).id;
    events = api.app.get(EventsService);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  async function openEvent(slug: string, endsAt: Date = DST_END): Promise<string> {
    const created = await events.create(
      {
        title: slug,
        timezone: 'Europe/Paris',
        startsAt: DST_START,
        endsAt,
        type: 'standard',
        challengeIds: [challengeId]
      },
      admin
    );
    await prisma.event.update({ where: { id: created.id }, data: { status: 'open' } });
    await player.agent.post(`/api/v1/events/${created.id}/join`);
    return created.id;
  }

  it('valide un fuseau IANA et conserve des bornes UTC à travers l’heure d’été', async () => {
    const created = await events.create(
      {
        title: 'Event DST',
        timezone: 'Europe/Paris',
        startsAt: DST_START,
        endsAt: DST_END,
        type: 'battle_royale',
        challengeIds: [challengeId]
      },
      admin
    );

    const row = await prisma.event.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.timezone).toBe('Europe/Paris');
    expect(row.startsAt.toISOString()).toBe(DST_START.toISOString());
    expect(row.endsAt.toISOString()).toBe(DST_END.toISOString());

    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: row.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    expect(formatter.format(row.startsAt)).toBe('01:30');
    expect(formatter.format(row.endsAt)).toBe('04:30');
  });

  it('refuse un fuseau IANA inconnu', async () => {
    await expect(
      events.create(
        {
          title: 'Event Mars',
          timezone: 'Mars/Olympus',
          startsAt: DST_START,
          endsAt: DST_END,
          type: 'standard'
        },
        admin
      )
    ).rejects.toMatchObject({ response: { code: 'INVALID_TIMEZONE' } });
  });

  it('accepte une soumission juste avant ends_at avec la priorité de file 1', async () => {
    const eventId = await openEvent('event-before-boundary');
    clock.set(new Date(DST_END.getTime() - 1_000));
    await player.agent.post(`/api/v1/events/${eventId}/start`);

    const response = await player.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(1)', eventId });

    expect(response.status).toBe(202);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(row.eventId).toBe(eventId);

    const { QueueService } = await import('../../src/queue/queue.module');
    const job = await api.app.get(QueueService).submissions.getJob(response.body.id);
    expect(job?.opts.priority).toBe(1);
  });

  it('refuse une soumission exactement à ends_at sans créer de soumission', async () => {
    const eventId = await openEvent('event-at-boundary');
    clock.set(new Date(DST_START.getTime() + 60_000));
    await player.agent.post(`/api/v1/events/${eventId}/start`);
    clock.set(new Date(DST_END.getTime()));

    const response = await player.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(2)', eventId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EVENT_CLOSED');
    expect(await prisma.submission.count({ where: { eventId } })).toBe(0);
  });

  it('refuse une seconde soumission sur le même événement', async () => {
    const eventId = await openEvent('event-single-submission');
    clock.set(new Date(DST_START.getTime() + 60_000));
    await player.agent.post(`/api/v1/events/${eventId}/start`);

    const first = await player.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(3)', eventId });
    expect(first.status).toBe(202);

    const second = await player.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(4)', eventId });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EVENT_ATTEMPT_ALREADY_USED');
    expect(await prisma.submission.count({ where: { eventId } })).toBe(1);
  });
});
