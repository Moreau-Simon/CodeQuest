import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { seedBattleFixture } from '../helpers/battle';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T217 [P] [US14] — écrit avant l'implémentation (constitution IV).
 *
 * FR-097 à FR-101 : transitions sur l'horloge serveur, élimination du dernier,
 * déconnexion sans pause, passage spectateur et report sous le minimum.
 */
describe('US14 — battle royale (T217)', () => {
  const NOW = new Date('2031-04-10T10:00:00.000Z');
  const STARTS_AT = new Date('2031-04-10T09:00:00.000Z');
  const ENDS_AT = new Date('2031-04-10T11:00:00.000Z');

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let players: TestPlayer[];
  let dropout: TestPlayer;
  let challengeId: string;
  let RoundServiceClass: typeof import('../../src/modules/battle-royale/round.service').RoundService;
  let NotEnoughParticipantsErrorClass: typeof import('../../src/modules/battle-royale/eligibility.service').NotEnoughParticipantsError;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    RoundServiceClass = (await import('../../src/modules/battle-royale/round.service')).RoundService;
    NotEnoughParticipantsErrorClass = (
      await import('../../src/modules/battle-royale/eligibility.service')
    ).NotEnoughParticipantsError;
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    players = [];
    for (let index = 0; index < 8; index += 1) {
      players.push(await createTestPlayer(api, prisma, `br-p${index}`));
    }
    dropout = await createTestPlayer(api, prisma, 'br-dropout');
    const theme = await seedTheme(prisma, 'theme-battle-royale');
    challengeId = (await seedChallenge(prisma, theme.id, 'Défi de manche')).id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(() => clock.set(NOW));

  async function fixture(joined = 8, minParticipants = 8, roster = players) {
    return seedBattleFixture({
      api,
      prisma,
      slug: `br-${uuidv7()}`,
      players: roster.slice(0, joined),
      challengeId,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      minParticipants,
      creatorId: players[0]!.id
    });
  }

  it('transite scheduled → open → closed et élimine le score le plus faible', async () => {
    const { eventId } = await fixture();
    const service = api.app.get(RoundServiceClass);

    const scheduled = await service.schedule(eventId, {
      challengeId,
      startsAt: NOW,
      endsAt: ENDS_AT
    });
    expect(scheduled.status).toBe('scheduled');

    clock.set(NOW);
    const opened = await service.openDue();
    expect(opened.map((round) => round.id)).toContain(scheduled.id);

    for (let index = 0; index < players.length; index += 1) {
      await service.recordResult(scheduled.id, {
        subjectType: 'player',
        subjectId: players[index]!.id,
        score: (index + 1) * 100,
        submittedAt: new Date(NOW.getTime() + index * 1_000)
      });
    }

    clock.set(ENDS_AT);
    const closed = await service.closeDue();
    const summary = closed.find((round) => round.roundId === scheduled.id);
    expect(summary?.eliminated.map((entry) => entry.subjectId)).toEqual([players[0]!.id]);
    expect(summary?.remaining).toBe(7);

    const round = await prisma.battleRound.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(round.status).toBe('closed');
    const eliminated = await prisma.eventParticipant.findUniqueOrThrow({
      where: {
        eventId_subjectType_subjectId: {
          eventId,
          subjectType: 'player',
          subjectId: players[0]!.id
        }
      }
    });
    expect(eliminated.eliminatedAt).not.toBeNull();
  });

  it('ne suspend pas la manche quand un participant se déconnecte', async () => {
    const roster = [...players.slice(0, 7), dropout];
    const { eventId } = await fixture(8, 8, roster);
    const service = api.app.get(RoundServiceClass);
    const round = await service.schedule(eventId, { challengeId, startsAt: NOW, endsAt: ENDS_AT });
    clock.set(NOW);
    await service.openDue();

    const logout = await dropout.agent.post('/api/v1/auth/logout');
    expect(logout.status).toBe(204);

    await service.recordResult(round.id, {
      subjectType: 'player',
      subjectId: dropout.id,
      score: 999,
      submittedAt: NOW
    });
    clock.set(ENDS_AT);
    const closed = await service.closeDue();

    expect(closed.find((entry) => entry.roundId === round.id)?.status).toBe('closed');
    const result = await prisma.roundResult.findUniqueOrThrow({
      where: {
        roundId_subjectType_subjectId: {
          roundId: round.id,
          subjectType: 'player',
          subjectId: dropout.id
        }
      }
    });
    expect(result.score!.toNumber()).toBe(999);
    expect(result.eliminated).toBe(false);
  });

  it('refuse toute soumission à un participant éliminé (mode spectateur)', async () => {
    const { eventId } = await fixture();
    const service = api.app.get(RoundServiceClass);
    const round = await service.schedule(eventId, { challengeId, startsAt: NOW, endsAt: ENDS_AT });
    for (let index = 0; index < players.length; index += 1) {
      await service.recordResult(round.id, {
        subjectType: 'player',
        subjectId: players[index]!.id,
        score: (index + 1) * 100,
        submittedAt: new Date(NOW.getTime() + index * 1_000)
      });
    }
    clock.set(ENDS_AT);
    await service.closeDue();
    clock.set(NOW);

    const attempt = await players[0]!.agent.post(`/api/v1/events/${eventId}/start`);
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('PARTICIPANT_ELIMINATED');
  });

  it('expose les manches et leurs résultats aux participants connectés', async () => {
    const { eventId } = await fixture();
    const service = api.app.get(RoundServiceClass);
    const round = await service.schedule(eventId, { challengeId, startsAt: NOW, endsAt: ENDS_AT });
    await service.recordResult(round.id, {
      subjectType: 'player',
      subjectId: players[0]!.id,
      score: 100,
      submittedAt: NOW
    });

    const response = await players[0]!.agent.get(`/api/v1/events/${eventId}/rounds`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: round.id,
        eventId,
        roundNumber: 1,
        status: 'scheduled',
        results: [expect.objectContaining({ subjectId: players[0]!.id, score: 100 })]
      })
    ]);
  });

  it('reporte l’événement sous le minimum de participants sans créer de manche', async () => {
    const { eventId } = await fixture(7);
    const service = api.app.get(RoundServiceClass);
    const { RealtimeGateway } = await import('../../src/realtime/realtime.gateway');
    const notify = jest.spyOn(api.app.get(RealtimeGateway), 'emitToUser');

    await expect(
      service.schedule(eventId, { challengeId, startsAt: NOW, endsAt: ENDS_AT })
    ).rejects.toBeInstanceOf(NotEnoughParticipantsErrorClass);
    expect(await prisma.battleRound.count({ where: { eventId } })).toBe(0);
    expect(notify).toHaveBeenCalledWith(
      players[0]!.id,
      'notification.new',
      expect.objectContaining({ kind: 'event_postponed' })
    );
    notify.mockRestore();
  });
});
