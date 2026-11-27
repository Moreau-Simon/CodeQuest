import { PrismaClient } from '@prisma/client';
import type { Socket } from 'socket.io-client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { connectPlayer, listenOnce } from '../helpers/realtime-socket';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T227 [P] [US15] — écrit avant l'implémentation (constitution IV).
 *
 * FR-093 : fenêtre glissante par compte ET par préfixe d'adresse, avec
 * `retryAfterMs` ; `chat.typing` au plus une émission par 2 secondes.
 */
describe('Limitation de débit du chat (T227)', () => {
  const NOW = new Date('2031-06-03T11:00:00.000Z');
  const IP = '198.51.100.24';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let channelId: string;
  let port: number;
  let socket: Socket | undefined;
  let ChatRateLimitService: typeof import('../../src/modules/chat/chat-rate-limit.service').ChatRateLimitService;
  let CHAT_MESSAGE_LIMIT: typeof import('../../src/modules/chat/chat-rate-limit.service').CHAT_MESSAGE_LIMIT;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    port = await listenOnce(api);

    const module = await import('../../src/modules/chat/chat-rate-limit.service');
    ChatRateLimitService = module.ChatRateLimitService;
    CHAT_MESSAGE_LIMIT = module.CHAT_MESSAGE_LIMIT;
    player = await createTestPlayer(api, prisma, 'chat-rate');
    channelId = (
      await prisma.chatChannel.create({
        data: { id: uuidv7(), kind: 'global', scopeId: null, name: 'Global', createdAt: NOW }
      })
    ).id;
  }, 180_000);

  afterAll(async () => {
    socket?.disconnect();
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('limite les envois par compte et par préfixe IP avec retryAfterMs', async () => {
    const limiter = api.app.get(ChatRateLimitService);
    const account = uuidv7();

    for (let index = 0; index < CHAT_MESSAGE_LIMIT; index += 1) {
      await expect(limiter.assertCanSend(account, IP)).resolves.toBeUndefined();
    }
    await expect(limiter.assertCanSend(account, IP)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: expect.any(Number)
    });

    // Même compte, autre adresse : la limite par compte s'applique toujours.
    await expect(limiter.assertCanSend(account, '198.51.100.99')).rejects.toMatchObject({
      code: 'RATE_LIMITED'
    });
    // Autre compte, même préfixe : la limite par adresse s'applique toujours.
    await expect(limiter.assertCanSend(uuidv7(), IP)).rejects.toMatchObject({
      code: 'RATE_LIMITED'
    });
  });

  it('limite chat.typing à une émission toutes les deux secondes', async () => {
    const limiter = api.app.get(ChatRateLimitService);
    const account = uuidv7();

    expect(() => limiter.assertCanType(account)).not.toThrow();
    let rejected: unknown;
    try {
      limiter.assertCanType(account);
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: expect.any(Number)
    });
    clock.advance(2_000);
    expect(() => limiter.assertCanType(account)).not.toThrow();
  });

  it('refuse un chat.send excessif via le socket avec un délai avant nouvel essai', async () => {
    socket = await connectPlayer(api, player, port);
    expect(await socket.emitWithAck('room.join', { room: `channel:${channelId}` })).toMatchObject({
      ok: true
    });
    const results: unknown[] = [];
    for (let index = 0; index <= CHAT_MESSAGE_LIMIT; index += 1) {
      results.push(
        await socket.emitWithAck('chat.send', {
          channelId,
          body: `message ${index}`,
          clientMessageId: uuidv7()
        })
      );
    }

    expect(results.slice(0, CHAT_MESSAGE_LIMIT)).toEqual(
      Array.from({ length: CHAT_MESSAGE_LIMIT }, () => expect.objectContaining({ ok: true }))
    );
    expect(results[CHAT_MESSAGE_LIMIT]).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED'
    });
    const rejected = results[CHAT_MESSAGE_LIMIT] as { retryAfterMs?: number };
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
  });
});
