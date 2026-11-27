import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { TestApp } from './app';
import type { TestPlayer } from './teams';

const PASSWORD = 'correct-horse-battery-staple';
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Écoute une seule fois sur un port éphémère pour tous les sockets du test. */
export async function listenOnce(api: TestApp): Promise<number> {
  const server = api.app.getHttpServer();
  const current = server.address();
  if (typeof current === 'object' && current) return current.port;
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

/** Obtient le cookie de session d'un joueur créé par `createTestPlayer`. */
export async function cookieFor(api: TestApp, player: TestPlayer): Promise<string> {
  const agent = request.agent(api.app.getHttpServer());
  const login = await agent.post('/api/v1/auth/login').send({
    identifier: `${player.pseudonym}@example.com`,
    password: PASSWORD
  });
  if (login.status !== 200) throw new Error(`Connexion ${player.pseudonym} refusée`);
  const cookie = (login.headers['set-cookie'] as string[] | undefined)
    ?.map((entry) => entry.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error(`Aucun cookie de session pour ${player.pseudonym}`);
  return cookie;
}

export async function connectPlayer(
  api: TestApp,
  player: TestPlayer,
  port: number
): Promise<Socket> {
  const socket = io(`http://127.0.0.1:${port}/realtime`, {
    transports: ['websocket'],
    extraHeaders: { Cookie: await cookieFor(api, player) }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error: Error) => reject(error));
  });
  return socket;
}

export function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 1_000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Événement ${event} non reçu`)), timeoutMs);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload as T);
    });
  });
}

/** Vérifie l'enveloppe commune `{ id, type, at, data }` du contrat. */
export function expectEnvelope(payload: unknown, type: string): Record<string, unknown> {
  expect(payload).toMatchObject({ type });
  const envelope = payload as { id: string; type: string; at: string; data: Record<string, unknown> };
  expect(envelope.id).toMatch(UUIDV7);
  expect(Number.isNaN(Date.parse(envelope.at))).toBe(false);
  return envelope.data;
}
