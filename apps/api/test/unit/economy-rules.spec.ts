import type { AuthenticatedUser } from '../../src/common/auth/authenticated-user';
import { Clock } from '../../src/common/clock';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { BadgesService } from '../../src/modules/economy/badges.service';
import { HintPolicy } from '../../src/modules/economy/hint.policy';
import {
  bitsForScore,
  bitsForStreak,
  bitsFromRewards,
  consecutiveDays,
  RewardsService
} from '../../src/modules/economy/rewards.service';
import { LedgerService } from '../../src/modules/economy/ledger.service';

/**
 * T264 — couverture des règles métier économie (FR-042, FR-072/075).
 * Écrit après le policy test rouge, sans modifier le comportement testé.
 */
const USER: AuthenticatedUser = {
  id: 'user-1',
  pseudonym: 'ada',
  status: 'active',
  roles: [],
  permissions: new Set()
};

const ISO = (day: number): Date => new Date(`2031-06-${String(day).padStart(2, '0')}T10:00:00Z`);

describe('Règles pures des récompenses (T264)', () => {
  it('convertit un score en Bits avec un plancher d’un Bit', () => {
    expect(bitsForScore(0)).toBe(0);
    expect(bitsForScore(-10)).toBe(0);
    expect(bitsForScore(Number.NaN)).toBe(0);
    expect(bitsForScore(9)).toBe(1);
    expect(bitsForScore(255)).toBe(26);
  });

  it('plafonne la série quotidienne à sept Bits', () => {
    expect(bitsForStreak(-2)).toBe(0);
    expect(bitsForStreak(3.9)).toBe(3);
    expect(bitsForStreak(30)).toBe(7);
  });

  it('ignore les connexions dupliquées et les séries interrompues', () => {
    const today = ISO(3);
    expect(consecutiveDays([ISO(1), ISO(1), ISO(2), ISO(3)], today)).toBe(3);
    expect(consecutiveDays([ISO(1), ISO(2), ISO(3)], ISO(5))).toBe(0);
    expect(consecutiveDays([], today)).toBe(0);
    expect(consecutiveDays([ISO(3)], today)).toBe(1);
  });

  it('lit la composante Bits d’un bloc de récompenses hétérogène', () => {
    expect(bitsFromRewards({ bits: 12 })).toBe(12);
    expect(bitsFromRewards({ amount: 8 })).toBe(8);
    expect(bitsFromRewards([{ kind: 'bits', amount: 5 }, { kind: 'title', amount: 99 }])).toBe(5);
    expect(bitsFromRewards('invalide')).toBe(0);
    expect(bitsFromRewards({ bits: -3 })).toBe(0);
  });
});

describe('RewardsService (T264)', () => {
  const ledger = { credit: jest.fn().mockResolvedValue(undefined) };
  const badges = { evaluate: jest.fn().mockResolvedValue([]) };
  const prisma = {
    submission: { count: jest.fn() },
    wallet: { findUnique: jest.fn() },
    transaction: { findMany: jest.fn() }
  };
  const clock = { now: jest.fn(() => ISO(3)), nowMs: jest.fn(() => ISO(3).getTime()) };
  let service: RewardsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.submission.count.mockResolvedValue(0);
    prisma.wallet.findUnique.mockResolvedValue(null);
    prisma.transaction.findMany.mockResolvedValue([]);
    service = new RewardsService(
      prisma as unknown as PrismaService,
      clock as unknown as Clock,
      ledger as unknown as LedgerService,
      badges as unknown as BadgesService
    );
  });

  it('ne verse rien pour un score nul', async () => {
    await service.awardChallenge({
      userId: USER.id,
      challengeId: 'challenge',
      submissionId: 'sub-1',
      score: 0,
      isRecord: true
    });
    expect(ledger.credit).not.toHaveBeenCalled();
    expect(badges.evaluate).not.toHaveBeenCalled();
  });

  it('verse la récompense de défi, le bonus de record et évalue les badges', async () => {
    await service.awardChallenge({
      userId: USER.id,
      challengeId: 'challenge',
      submissionId: 'sub-1',
      score: 500,
      isRecord: true
    });
    expect(ledger.credit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      amount: 50,
      reason: 'challenge_reward',
      idempotencyKey: 'challenge:sub-1'
    }));
    expect(ledger.credit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      amount: 25,
      reason: 'record_bonus',
      idempotencyKey: 'record:sub-1'
    }));
    expect(badges.evaluate).toHaveBeenCalledWith(USER.id);
  });

  it('ne re verse pas la récompense de défi lors d’une soumission ultérieure', async () => {
    prisma.submission.count.mockResolvedValue(1);
    await service.awardChallenge({
      userId: USER.id,
      challengeId: 'challenge',
      submissionId: 'sub-2',
      score: 900,
      isRecord: false
    });
    expect(ledger.credit).not.toHaveBeenCalled();
    expect(badges.evaluate).toHaveBeenCalledWith(USER.id);
  });

  it('crédite une récompense d’événement une seule fois par participant', async () => {
    await service.awardEvent({ eventId: 'event', userId: USER.id, rewards: { bits: 40 } });
    expect(ledger.credit).toHaveBeenCalledWith(expect.objectContaining({
      amount: 40,
      idempotencyKey: 'event:event:user-1'
    }));
    ledger.credit.mockClear();
    await service.awardEvent({ eventId: 'event', userId: USER.id, rewards: null });
    expect(ledger.credit).not.toHaveBeenCalled();
  });

  it('répartit la récompense de boss entre les participants, avec un suffixe d’équipe', async () => {
    await service.awardBoss({
      bossId: 'boss',
      subjectType: 'team',
      subjectId: 'team-1',
      recipientIds: ['user-1', 'user-2'],
      rewards: [{ kind: 'bits', amount: 30 }]
    });
    expect(ledger.credit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: 'user-1',
      idempotencyKey: 'boss:boss:team-1:user-1'
    }));
    expect(ledger.credit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 'user-2',
      idempotencyKey: 'boss:boss:team-1:user-2'
    }));
    expect(badges.evaluate).toHaveBeenCalledTimes(2);
  });

  it('dérive la série de connexion du registre et borne la clé au jour UTC', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1' });
    prisma.transaction.findMany.mockResolvedValue([{ createdAt: ISO(2) }, { createdAt: ISO(1) }]);
    await service.awardStreak(USER.id);
    expect(ledger.credit).toHaveBeenCalledWith(expect.objectContaining({
      amount: 3,
      reason: 'streak',
      idempotencyKey: 'streak:user-1:2031-06-03'
    }));
  });
});

describe('HintPolicy (T264)', () => {
  const prisma = {
    challengeHint: { findUnique: jest.fn(), findMany: jest.fn() },
    eventParticipant: { findFirst: jest.fn() },
    bossEngagement: { findFirst: jest.fn() },
    hintPurchase: { findMany: jest.fn() }
  };
  const clock = { now: () => ISO(3) };
  let policy: HintPolicy;

  const hint = {
    id: 'hint-2',
    challengeId: 'challenge',
    challenge: { type: 'debugging' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.challengeHint.findUnique.mockResolvedValue(hint);
    prisma.eventParticipant.findFirst.mockResolvedValue(null);
    prisma.bossEngagement.findFirst.mockResolvedValue(null);
    prisma.hintPurchase.findMany.mockResolvedValue([]);
    prisma.challengeHint.findMany.mockResolvedValue([{ id: 'hint-1' }, { id: 'hint-2' }]);
    policy = new HintPolicy(prisma as unknown as PrismaService, clock as Clock);
  });

  it('exige une adresse confirmée avant tout achat', async () => {
    await expect(policy.assertAllowed({ ...USER, status: 'pending' }, 'hint-2')).rejects.toMatchObject({
      response: { code: 'EMAIL_NOT_VERIFIED' }
    });
  });

  it('interdit les indices en équipe', async () => {
    await expect(policy.assertAllowed(USER, 'hint-2', 'team-1')).rejects.toMatchObject({
      response: { code: 'HINT_SOLO_ONLY' }
    });
  });

  it('refuse un indice introuvable ou un type non exploratoire', async () => {
    prisma.challengeHint.findUnique.mockResolvedValueOnce(null);
    await expect(policy.assertAllowed(USER, 'inconnu')).rejects.toMatchObject({
      response: { code: 'HINT_NOT_FOUND' }
    });
    prisma.challengeHint.findUnique.mockResolvedValueOnce({
      ...hint,
      challenge: { type: 'algorithm' }
    });
    await expect(policy.assertAllowed(USER, 'hint-2')).rejects.toMatchObject({
      response: { code: 'HINT_NOT_ALLOWED' }
    });
  });

  it('bloque les indices pendant un event ouvert et une rencontre de boss', async () => {
    prisma.eventParticipant.findFirst.mockResolvedValueOnce({ eventId: 'event' });
    await expect(policy.assertAllowed(USER, 'hint-2')).rejects.toMatchObject({
      response: { code: 'HINT_DURING_EVENT' }
    });
    prisma.bossEngagement.findFirst.mockResolvedValueOnce({ id: 'engagement' });
    await expect(policy.assertAllowed(USER, 'hint-2')).rejects.toMatchObject({
      response: { code: 'HINT_DURING_BOSS' }
    });
  });

  it('refuse un indice déjà acheté', async () => {
    prisma.hintPurchase.findMany.mockResolvedValue([{ hintId: 'hint-2' }]);
    await expect(policy.assertAllowed(USER, 'hint-2')).rejects.toMatchObject({
      response: { code: 'HINT_ALREADY_PURCHASED' }
    });
  });

  it('impose l’achat progressif de l’indice précédent', async () => {
    await expect(policy.assertAllowed(USER, 'hint-2')).rejects.toMatchObject({
      response: { code: 'HINT_LOCKED' }
    });
  });

  it('autorise le premier indice exploratoire en solo', async () => {
    prisma.challengeHint.findUnique.mockResolvedValue({ ...hint, id: 'hint-1' });
    const allowed = await policy.assertAllowed(USER, 'hint-1');
    expect(allowed).toMatchObject({ challengeId: 'challenge', challengeType: 'debugging' });
  });
});
