import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T186 [P] [US11] — écrit avant l'implémentation (constitution IV).
 *
 * FR-072 → FR-076 : achat idempotent, solde insuffisant, historique dérivé du
 * registre et objets cosmétiques sans effet sur le score.
 */
describe('US11 — boutique et registre (T186)', () => {
  const NOW = new Date('2030-08-01T10:00:00.000Z');

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let player: TestPlayer;
  let credit: (amount: number, key: string) => Promise<void>;

  interface WalletView {
    balance: number;
    recentTransactions: Array<{
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
    }>;
  }

  interface PurchaseView {
    itemId: string;
    sku: string;
    priceBits: number;
    balance: number;
    quantity: number;
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    // L'horloge est figée avant l'authentification (sessions valides).
    const clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    const { LedgerService } = await import('../../src/modules/economy/ledger.service');
    const ledger = api.app.get(LedgerService);
    credit = async (amount, key) => {
      await ledger.credit({
        userId: player.id,
        amount,
        reason: 'admin_adjustment',
        idempotencyKey: `seed:${key}`,
        referenceType: 'player',
        referenceId: player.id
      });
    };

    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    player = await createTestPlayer(api, prisma, 'shop-player');
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  async function seedItem(
    sku: string,
    kind: 'potion' | 'avatar' | 'title' | 'editor_theme',
    priceBits: number,
    isActive = true
  ): Promise<string> {
    const id = uuidv7();
    await prisma.shopItem.create({
      data: { id, sku, name: sku, kind, priceBits, isActive, metadata: {} }
    });
    return id;
  }

  async function wallet(): Promise<WalletView> {
    const response = await player.agent.get('/api/v1/me/wallet');
    expect(response.status).toBe(200);
    return response.body as WalletView;
  }

  function purchase(itemId: string, key: string) {
    return player.agent
      .post(`/api/v1/shop/${itemId}/purchase`)
      .set('Idempotency-Key', key)
      .send({});
  }

  it('affiche uniquement les objets actifs du catalogue', async () => {
    const active = await seedItem('catalogue-potion', 'potion', 50);
    await seedItem('catalogue-hidden', 'avatar', 50, false);

    const response = await player.agent.get('/api/v1/shop');
    expect(response.status).toBe(200);
    const items = response.body as Array<{ id: string; sku: string; available: boolean }>;
    expect(items.find((item) => item.id === active)).toMatchObject({
      sku: 'catalogue-potion',
      available: true
    });
    expect(items.some((item) => item.sku === 'catalogue-hidden')).toBe(false);
  });

  it('refuse un achat si le solde est insuffisant, sans écrire de transaction', async () => {
    await credit(30, 'shop-low-balance');
    const item = await seedItem('shop-expensive', 'potion', 5_000);
    const before = await wallet();

    const response = await purchase(item, 'shop-insufficient');
    expect(response.status).toBe(402);
    expect(response.body.code).toBe('INSUFFICIENT_BITS');
    expect((await wallet()).balance).toBe(before.balance);
    expect(await prisma.transaction.count({ where: { reason: 'potion_purchase' } })).toBe(0);
  });

  it('débite une seule fois lors d’un rejeu avec la même clé d’idempotence', async () => {
    await credit(1_000, 'shop-idempotence');
    const item = await seedItem('shop-potion', 'potion', 100);
    const before = await wallet();

    const first = await purchase(item, 'potion-key-1');
    expect(first.status).toBe(201);
    const body = first.body as PurchaseView;
    expect(body).toMatchObject({ itemId: item, sku: 'shop-potion', priceBits: 100 });
    expect(body.balance).toBe(before.balance - 100);
    expect(body.quantity).toBe(1);

    const replay = await purchase(item, 'potion-key-1');
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(body);

    const after = await wallet();
    expect(after.balance).toBe(before.balance - 100);
    expect(
      await prisma.transaction.count({
        where: { idempotencyKey: 'purchase:potion-key-1' }
      })
    ).toBe(1);
    expect(after.recentTransactions.reduce((sum, tx) => sum + tx.amount, 0)).toBe(after.balance);
  });

  it('laisse le score inchangé lorsqu’un objet cosmétique est équipé', async () => {
    await credit(500, 'shop-cosmetic');
    const item = await seedItem('shop-avatar', 'avatar', 50);
    const bought = await purchase(item, 'avatar-key');
    expect(bought.status).toBe(201);

    const equip = await player.agent.post(`/api/v1/me/inventory/${item}/equip`).send({});
    expect(equip.status).toBe(200);
    expect(equip.body).toMatchObject({ itemId: item, equipped: true });

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { userId_shopItemId: { userId: player.id, shopItemId: item } }
    });
    expect(inventory.equipped).toBe(true);
    expect(await prisma.bestScore.count({ where: { subjectId: player.id } })).toBe(0);
  });
});
