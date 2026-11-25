import { PrismaClient } from '@prisma/client';
import type request from 'supertest';
import type { BossService as BossServiceType } from '../../src/modules/bosses/boss.service';
import type { HealthService as HealthServiceType } from '../../src/modules/bosses/health.service';
import type { TeamHealthService as TeamHealthServiceType } from '../../src/modules/bosses/team-health.service';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, createTeam, type TestPlayer } from '../helpers/teams';

/**
 * T176 [P] [US10] — écrit avant l'implémentation (constitution IV).
 *
 * FR-066 → FR-071 : phases ordonnées, dégâts proportionnels au score,
 * victoire unique, KO de 30 min, potion et pool de PV partagé en équipe.
 */
describe('US10 — boss et points de vie (T176)', () => {
  const NOW = new Date('2030-07-01T10:00:00.000Z');

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let bossService: BossServiceType;
  let healthService: HealthServiceType;
  let teamHealth: TeamHealthServiceType;
  let emitSpy: jest.SpyInstance;

  interface BossPhaseSeed {
    id: string;
    challengeId: string;
    order: number;
  }

  interface BossSeed {
    id: string;
    phases: BossPhaseSeed[];
  }

  function phaseAt(boss: BossSeed, index: number): BossPhaseSeed {
    const phase = boss.phases[index];
    if (!phase) throw new Error(`Phase ${index} absente du boss ${boss.id}`);
    return phase;
  }

  function viewPhaseAt(view: BossView, index: number): BossView['phases'][number] {
    const phase = view.phases[index];
    if (!phase) throw new Error(`Phase ${index} absente de la réponse`);
    return phase;
  }

  interface BossView {
    id: string;
    name: string;
    maxHp: number;
    chapter: string;
    phases: Array<{ id: string; order: number; completed: boolean }>;
    hpRemaining: number | null;
    defeated: boolean;
  }

  interface HealthView {
    hp: number;
    maxHp: number;
    koUntil: string | null;
    nextRegenAt: string | null;
    serverNow: string;
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    // L'authentification doit utiliser l'heure réelle (CHECK sessions_expiry_check).
    clock = new FrozenClock(new Date());
    api = await createTestApp(infra, { clock });
    // Import après createTestApp : `src/config/env` y est initialisé avec les
    // URLs des conteneurs, pas celles par défaut de `test/env.ts`.
    const { BossService } = await import('../../src/modules/bosses/boss.service');
    const { HealthService } = await import('../../src/modules/bosses/health.service');
    const { TeamHealthService } = await import('../../src/modules/bosses/team-health.service');
    const { RealtimeGateway } = await import('../../src/realtime/realtime.gateway');
    bossService = api.app.get(BossService);
    healthService = api.app.get(HealthService);
    teamHealth = api.app.get(TeamHealthService);
    emitSpy = jest.spyOn(api.app.get(RealtimeGateway), 'emitToUser');

    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    player = await createTestPlayer(api, prisma, 'boss-player');
    clock.set(NOW);
  }, 180_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(() => {
    clock.set(NOW);
    emitSpy.mockClear();
  });

  async function seedBoss(slug: string, maxHp = 20): Promise<BossSeed> {
    const chapter = await prisma.loreChapter.create({
      data: { id: uuidv7(), slug: `chapter-${slug}`, title: slug, contentMd: 'Chapitre de test' }
    });
    const theme = await seedTheme(prisma, `theme-${slug}`);
    const phases: BossPhaseSeed[] = [];
    for (const order of [1, 2]) {
      const challenge = await seedChallenge(prisma, theme.id, `Phase ${order} de ${slug}`);
      phases.push({ id: uuidv7(), challengeId: challenge.id, order });
    }

    await prisma.boss.create({
      data: {
        id: uuidv7(),
        slug,
        name: slug,
        maxHp,
        loreChapterId: chapter.id,
        rewards: { bits: 500 },
        phases: {
          create: phases.map((phase) => ({
            id: phase.id,
            order: phase.order,
            challengeId: phase.challengeId,
            hpShare: 50,
            damageRule: { per_100_score: 5, failureCost: 15 }
          }))
        }
      }
    });

    const created = await prisma.boss.findUniqueOrThrow({
      where: { slug },
      select: { id: true }
    });
    return { id: created.id, phases };
  }

  function submitPhase(
    agent: request.Agent,
    boss: BossSeed,
    phaseId: string,
    teamId?: string
  ): Promise<request.Response> {
    return agent
      .post(`/api/v1/bosses/${boss.id}/phases/${phaseId}/submissions`)
      .send({ language: 'python', code: 'print(1)', ...(teamId ? { teamId } : {}) });
  }

  async function bossView(boss: BossSeed): Promise<BossView> {
    const response = await player.agent.get('/api/v1/bosses');
    expect(response.status).toBe(200);
    const found = (response.body as BossView[]).find((item) => item.id === boss.id);
    if (!found) throw new Error(`Boss ${boss.id} absent de la réponse`);
    return found;
  }

  async function healthView(agent: request.Agent = player.agent): Promise<HealthView> {
    const response = await agent.get('/api/v1/me/health');
    expect(response.status).toBe(200);
    return response.body as HealthView;
  }

  it('présente les phases dans l’ordre et refuse une phase non atteinte', async () => {
    const boss = await seedBoss('boss-order');
    const view = await bossView(boss);

    expect(view.phases.map((phase) => phase.order)).toEqual([1, 2]);
    expect(view.phases.every((phase) => !phase.completed)).toBe(true);
    expect(view.hpRemaining).toBeNull();
    expect(view.defeated).toBe(false);

    const locked = await submitPhase(player.agent, boss, phaseAt(boss, 1).id);
    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe('PHASE_NOT_REACHED');
  });

  it('inflige des dégâts proportionnels au score et n’attribue la victoire qu’une fois', async () => {
    const boss = await seedBoss('boss-victory');

    const first = await submitPhase(player.agent, boss, phaseAt(boss, 0).id);
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ bossPhaseId: phaseAt(boss, 0).id, status: 'pending' });
    await bossService.applyPhaseVerdict(first.body.submissionId as string, 'passed', 200);

    const afterFirst = await bossView(boss);
    expect(afterFirst.hpRemaining).toBe(10);
    expect(viewPhaseAt(afterFirst, 0).completed).toBe(true);
    expect(viewPhaseAt(afterFirst, 1).completed).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith(
      player.id,
      'boss.phase.cleared',
      expect.objectContaining({ bossId: boss.id, phaseOrder: 1, bossHpRemaining: 10 })
    );

    const second = await submitPhase(player.agent, boss, phaseAt(boss, 1).id);
    expect(second.status).toBe(202);
    await bossService.applyPhaseVerdict(second.body.submissionId as string, 'passed', 200);

    const defeated = await bossView(boss);
    expect(defeated.hpRemaining).toBe(0);
    expect(defeated.defeated).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith(
      player.id,
      'boss.defeated',
      expect.objectContaining({ bossId: boss.id })
    );

    const again = await submitPhase(player.agent, boss, phaseAt(boss, 1).id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('BOSS_ALREADY_DEFEATED');
  });

  it('retire 15 PV à la joueuse lors d’une phase échouée', async () => {
    const boss = await seedBoss('boss-failure');
    const submission = await submitPhase(player.agent, boss, phaseAt(boss, 0).id);
    await bossService.applyPhaseVerdict(submission.body.submissionId as string, 'failed', 0);

    const health = await healthView();
    expect(health).toMatchObject({ hp: 85, maxHp: 100, koUntil: null });
    expect(emitSpy).toHaveBeenCalledWith(
      player.id,
      'health.changed',
      expect.objectContaining({ hp: 85, delta: -15, reason: 'boss_failure' })
    );
  });

  it('bloque le boss pendant 30 min en KO puis reprend la régénération', async () => {
    const boss = await seedBoss('boss-ko');
    await healthService.damage('player', player.id, 85, 'boss_failure');

    const ko = await healthView();
    expect(ko.hp).toBe(0);
    expect(ko.koUntil).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString());
    expect(emitSpy).toHaveBeenCalledWith(
      player.id,
      'health.ko',
      expect.objectContaining({ hp: 0, koUntil: ko.koUntil, reason: 'boss_failure' })
    );

    const blocked = await submitPhase(player.agent, boss, phaseAt(boss, 0).id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('BOSS_KO');
    expect(blocked.body.message).toMatch(/\d+ min/);
    expect(blocked.body.details).toMatchObject({ koUntil: ko.koUntil, reason: 'boss_failure' });

    clock.advance(30 * 60_000 + 1_000);
    const recovered = await healthView();
    expect(recovered.hp).toBe(1);
    expect(recovered.koUntil).toBeNull();

    const allowed = await submitPhase(player.agent, boss, phaseAt(boss, 0).id);
    expect(allowed.status).toBe(202);
  });

  it('restaure instantanément les PV par potion et lève le KO', async () => {
    await healthService.damage('player', player.id, 100, 'boss_failure');
    const restored = await healthService.restore('player', player.id, 50, 'potion');

    expect(restored).toMatchObject({ hp: 50, maxHp: 100, koUntil: null });
    expect(emitSpy).toHaveBeenCalledWith(
      player.id,
      'health.restored',
      expect.objectContaining({ hp: 50, source: 'potion', koUntil: null })
    );
    expect(await healthView()).toMatchObject({ hp: 50, koUntil: null });
  });

  it('partage un seul pool de PV entre les membres d’une équipe', async () => {
    const team = await createTeam(player.agent, 'Raid US10', 'RAID10');
    const member = await createTestPlayer(api, prisma, 'raid-member');
    await prisma.teamMember.create({
      data: { id: uuidv7(), teamId: team.id, userId: member.id, role: 'member', joinedAt: NOW }
    });

    await teamHealth.damage(team.id, player.id, 25, 'boss_failure');
    expect((await teamHealth.read(team.id)).hp).toBe(75);
    expect((await healthService.read('team', team.id)).hp).toBe(75);
    expect((await healthView(member.agent)).hp).toBe(100);

    const boss = await seedBoss('boss-team');
    const submission = await submitPhase(member.agent, boss, phaseAt(boss, 0).id, team.id);
    expect(submission.status).toBe(202);
    await bossService.applyPhaseVerdict(submission.body.submissionId as string, 'failed', 0);

    expect((await teamHealth.read(team.id)).hp).toBe(60);
    expect((await healthService.read('player', member.id)).hp).toBe(100);
  });
});
