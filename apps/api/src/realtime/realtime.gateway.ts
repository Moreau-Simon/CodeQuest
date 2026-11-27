import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  forwardRef,
  type OnApplicationShutdown
} from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Namespace, Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import { verifyAccessToken } from '../common/auth/access-token';
import { uuidv7 } from '../common/uuid';
import { MetricsService } from '../common/metrics/metrics.service';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import {
  LEADERBOARD_PERIODS,
  LEADERBOARD_SCOPES,
  leaderboardRoom
} from '../modules/leaderboards/leaderboard.constants';
import {
  ChatRateLimitedError,
  ChatRateLimitService
} from '../modules/chat/chat-rate-limit.service';
import { ChatService } from '../modules/chat/chat.service';
import { VoiceService } from '../modules/chat/voice.service';
import {
  REALTIME_NAMESPACE,
  REALTIME_REVOKE_CHANNEL,
  channelRoom,
  documentRoom,
  eventRoom,
  spectatorRoom,
  type RealtimeRevocation
} from './realtime.constants';
import { RealtimeSessions } from './realtime.sessions';
import { parseCookieHeader, type RealtimeSocket } from './realtime.sessions';
import { YjsProvider } from './yjs.provider';

class RealtimeAuthError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'SESSION_REVOKED') {
    super(code);
  }
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDocId(value: unknown): { teamId: string; challengeId: string } | null {
  if (typeof value !== 'string') return null;
  const [teamId, challengeId] = value.split(':');
  if (
    typeof teamId !== 'string' ||
    typeof challengeId !== 'string' ||
    !UUID_V4_PATTERN.test(teamId) ||
    !UUID_V4_PATTERN.test(challengeId)
  ) {
    return null;
  }
  return { teamId, challengeId };
}

function docErrorCode(error: unknown): string {
  if (error instanceof ForbiddenException) {
    const response = error.getResponse() as { code?: string };
    return response.code ?? 'FORBIDDEN';
  }
  return 'DOC_ERROR';
}

export interface ChatSocketAck {
  ok: boolean;
  room?: string;
  code?: string;
  messageId?: string;
  retryAfterMs?: number;
  token?: string;
  url?: string;
  expiresAt?: string;
}

function chatErrorCode(error: unknown): ChatSocketAck {
  if (error instanceof ChatRateLimitedError) {
    return { ok: false, code: error.code, retryAfterMs: error.retryAfterMs };
  }
  if (error instanceof ForbiddenException) {
    const response = error.getResponse() as { code?: string };
    return { ok: false, code: response.code ?? 'FORBIDDEN_ROOM' };
  }
  if (error instanceof BadRequestException) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }
  return { ok: false, code: 'CHAT_ERROR' };
}

/**
 * Gateway temps réel (T033) : authentification par cookie au handshake,
 * adaptateur Redis multi-instance, fermeture des sockets à la révocation.
 *
 * Chaque événement diffusé reste filtré côté serveur par appartenance à la
 * room : le socket ne remplace jamais un contrôle d'autorisation REST.
 */
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: env.WEB_ORIGIN, credentials: true },
  maxHttpBufferSize: 8192
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private server?: Namespace;
  private readonly extraClients: Redis[] = [];

  constructor(
    private readonly sessions: RealtimeSessions,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    @Inject(forwardRef(() => YjsProvider))
    private readonly yjs: YjsProvider,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    @Inject(forwardRef(() => ChatRateLimitService))
    private readonly chatRateLimit: ChatRateLimitService,
    @Inject(forwardRef(() => VoiceService))
    private readonly voice: VoiceService
  ) {}

  async afterInit(server: Namespace): Promise<void> {
    this.server = server;

    const adapterPub = this.redis.client.duplicate();
    const adapterSub = this.redis.client.duplicate();
    const adapter = createAdapter(adapterPub, adapterSub);
    server.server.adapter(adapter);
    // L'adaptateur ne ferme pas ses clients : ils sont libérés explicitement
    // à l'arrêt, sinon Jest/Node ne terminent jamais (sockets ouverts).
    this.extraClients.push(adapterPub, adapterSub);

    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch((error: unknown) => {
          const code =
            error instanceof RealtimeAuthError ? error.code : ('UNAUTHENTICATED' as const);
          const failure = new Error(code) as Error & { data: { code: string } };
          failure.data = { code };
          next(failure);
        });
    });

    const revocation = this.redis.client.duplicate();
    this.extraClients.push(revocation);
    await revocation.subscribe(REALTIME_REVOKE_CHANNEL);
    revocation.on('message', (_channel, payload) => {
      this.applyRevocation(payload);
    });
  }

  handleConnection(socket: Socket): void {
    const { userId, sessionId } = socket.data as { userId?: string; sessionId?: string };
    if (userId) {
      void socket.join(`user:${userId}`);
      this.emitToUser(userId, 'presence.changed', {
        room: `user:${userId}`,
        userId,
        state: 'online'
      });
    }
    this.sessions.register(socket as unknown as RealtimeSocket);
    this.metrics.setRealtimeConnections(this.sessions.count());
    void sessionId;
  }

  handleDisconnect(socket: Socket): void {
    const { userId } = socket.data as { userId?: string };
    if (userId) {
      this.emitToUser(userId, 'presence.changed', {
        room: `user:${userId}`,
        userId,
        state: 'offline'
      });
    }
    this.sessions.unregister(socket.id);
    this.metrics.setRealtimeConnections(this.sessions.count());
  }

  /**
   * Diffuse un événement dans une room avec l'enveloppe du contrat
   * `websocket-events.md` (`{ id, type, at, data }`).
   */
  emitToRoom(room: string, type: string, data: Record<string, unknown>): void {
    this.server?.to(room).emit(type, {
      id: uuidv7(),
      type,
      at: new Date().toISOString(),
      data
    });
  }

  emitToUser(userId: string, type: string, data: Record<string, unknown>): void {
    this.emitToRoom(`user:${userId}`, type, data);
  }

  /**
   * Abonnement à un classement (T099) : le socket rejoint la room de la vue
   * demandée. Le snapshot initial est chargé par REST, le socket ne diffuse
   * que les changements incrémentaux (contrat `websocket-events.md` §3.2).
   */
  @SubscribeMessage('leaderboard.subscribe')
  onLeaderboardSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): { ok: boolean; room?: string; code?: string } {
    const data = (payload ?? {}) as {
      scope?: unknown;
      scopeId?: unknown;
      subjectType?: unknown;
      period?: unknown;
    };

    const scope = LEADERBOARD_SCOPES.includes(data.scope as never)
      ? (data.scope as (typeof LEADERBOARD_SCOPES)[number])
      : 'global';
    const subjectType = data.subjectType === 'team' ? 'team' : 'player';
    const period = LEADERBOARD_PERIODS.includes(data.period as never)
      ? (data.period as (typeof LEADERBOARD_PERIODS)[number])
      : 'all';
    const scopeId =
      scope === 'global' ? '00000000-0000-0000-0000-000000000000' : String(data.scopeId ?? '');

    if (scope !== 'global' && !UUID_V4_PATTERN.test(scopeId)) {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }

    const room = leaderboardRoom(scope, scopeId, subjectType, period);
    void socket.join(room);
    return { ok: true, room };
  }

  /**
   * Battle royale (T224) : un socket n'entre dans la salle d'un événement
   * qu'après vérification de son inscription. Un joueur éliminé bascule dans
   * la salle des spectateurs (FR-099) : il continue de recevoir les manches
   * mais ne peut plus soumettre.
   */
  @SubscribeMessage('battle.subscribe')
  async onBattleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<{ ok: boolean; room?: string; code?: string }> {
    const data = (payload ?? {}) as { eventId?: unknown };
    const eventId = data.eventId;
    const userId = (socket.data as { userId?: string }).userId;
    if (typeof eventId !== 'string' || !UUID_V4_PATTERN.test(eventId) || !userId) {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }

    const participant = await this.prisma.eventParticipant.findUnique({
      where: {
        eventId_subjectType_subjectId: {
          eventId,
          subjectType: 'player',
          subjectId: userId
        }
      },
      select: { eliminatedAt: true }
    });
    if (!participant) return { ok: false, code: 'FORBIDDEN' };

    const room = participant.eliminatedAt ? spectatorRoom(eventId) : eventRoom(eventId);
    await socket.join(room);
    return { ok: true, room };
  }

  /**
   * Édition collaborative (T151/T160, FR-057) : l'update binaire est appliqué
   * par le provider après contrôle d'appartenance, puis diffusé à la room du
   * document. Le socket rejoint la room seulement après validation.
   */
  @SubscribeMessage('doc.update')
  async onDocumentUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<{ ok: boolean; version?: number; code?: string }> {
    const data = (payload ?? {}) as { docId?: unknown; update?: unknown };
    const parsed = parseDocId(data.docId);
    const userId = (socket.data as { userId?: string }).userId;
    if (!parsed || typeof data.update !== 'string' || !userId) {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }

    try {
      const result = await this.yjs.applyUpdate(
        parsed.teamId,
        parsed.challengeId,
        userId,
        data.update
      );
      void socket.join(documentRoom(parsed.teamId, parsed.challengeId));
      return { ok: true, version: result.version };
    } catch (error) {
      return { ok: false, code: docErrorCode(error) };
    }
  }

  /** Présence (curseur) : jamais persistée, toujours limitée à la room. */
  @SubscribeMessage('doc.awareness')
  async onDocumentAwareness(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<{ ok: boolean; code?: string }> {
    const data = (payload ?? {}) as { docId?: unknown; cursor?: unknown };
    const parsed = parseDocId(data.docId);
    const userId = (socket.data as { userId?: string }).userId;
    const cursor = data.cursor as { line?: unknown; ch?: unknown } | undefined;
    if (
      !parsed ||
      !userId ||
      !cursor ||
      !Number.isInteger(cursor.line) ||
      !Number.isInteger(cursor.ch) ||
      (cursor.line as number) < 0 ||
      (cursor.ch as number) < 0
    ) {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }

    try {
      // Le provider valide l'appartenance ; on ne fait pas confiance au docId.
      await this.yjs.assertMembership(parsed.teamId, parsed.challengeId, userId);
      void socket.join(documentRoom(parsed.teamId, parsed.challengeId));
      this.yjs.setAwareness(parsed.teamId, parsed.challengeId, userId, {
        line: cursor.line as number,
        ch: cursor.ch as number
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: docErrorCode(error) };
    }
  }

  /**
   * Contrat `websocket-events.md` §4 : le socket est déjà abonné à `user:<id>`
   * dès la connexion. Cet handler fournit l'acquittement explicite attendu par
   * le client lorsqu'il commence à suivre une soumission.
   */
  @SubscribeMessage('submission.watch')
  onSubmissionWatch(
    @MessageBody() payload: unknown
  ): { ok: boolean; code?: string } {
    const submissionId = (payload as { submissionId?: unknown } | null)?.submissionId;
    if (typeof submissionId !== 'string' || submissionId.length === 0) {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }
    return { ok: true };
  }

  /**
   * US15 (FR-092) : un socket ne rejoint une room de canal qu'après que le
   * service a vérifié l'appartenance. Les Audience complètes sont définies par
   * `ChatService.assertAccess` ; la salle `user:<id>` reste privée au titulaire.
   */
  @SubscribeMessage('room.join')
  async onRoomJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<ChatSocketAck> {
    const room = (payload as { room?: unknown } | null)?.room;
    const userId = (socket.data as { userId?: string }).userId;
    if (typeof room !== 'string' || !userId) return { ok: false, code: 'INVALID_PAYLOAD' };
    if (room === `user:${userId}`) {
      await socket.join(room);
      return { ok: true, room };
    }
    if (!room.startsWith('channel:')) return { ok: false, code: 'FORBIDDEN_ROOM' };

    try {
      await this.chat.assertAccess(room.slice('channel:'.length), userId);
    } catch (error) {
      return chatErrorCode(error);
    }
    await socket.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('room.leave')
  async onRoomLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<ChatSocketAck> {
    const room = (payload as { room?: unknown } | null)?.room;
    if (typeof room === 'string') await socket.leave(room);
    return { ok: true };
  }

  /** Contrat §4 : `chat.send` → `{ ok, messageId }` ou `{ ok: false, code }`. */
  @SubscribeMessage('chat.send')
  async onChatSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<ChatSocketAck> {
    const data = (payload ?? {}) as Record<string, unknown>;
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId || typeof data.channelId !== 'string') {
      return { ok: false, code: 'INVALID_PAYLOAD' };
    }
    try {
      const message = await this.chat.send({
        channelId: data.channelId,
        userId,
        body: data.body,
        clientMessageId: data.clientMessageId,
        address: socket.handshake.address
      });
      this.emitToRoom(channelRoom(data.channelId), 'chat.message', {
        channelId: message.channelId,
        messageId: message.id,
        authorName: message.authorName,
        body: message.body,
        createdAt: message.createdAt
      });
      return { ok: true, messageId: message.id };
    } catch (error) {
      return chatErrorCode(error);
    }
  }

  /** `chat.typing` est éphémère : jamais persisté, au plus une fois / 2 s. */
  @SubscribeMessage('chat.typing')
  async onChatTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<ChatSocketAck> {
    const channelId = (payload as { channelId?: unknown } | null)?.channelId;
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId || typeof channelId !== 'string') return { ok: false, code: 'INVALID_PAYLOAD' };
    try {
      this.chatRateLimit.assertCanType(userId);
      await this.chat.assertAccess(channelId, userId);
      const authorName = await this.chat.authorName(userId);
      this.emitToRoom(channelRoom(channelId), 'chat.typing', {
        channelId,
        authorName,
        expiresInMs: 3_000
      });
      return { ok: true };
    } catch (error) {
      return chatErrorCode(error);
    }
  }

  /** FR-095/FR-096 : jeton court, délivré seulement après contrôle du canal. */
  @SubscribeMessage('voice.join')
  async onVoiceJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: unknown
  ): Promise<ChatSocketAck> {
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId) return { ok: false, code: 'UNAUTHENTICATED' };
    try {
      const grant = await this.voice.authorize(
        (payload as { roomName?: unknown } | null)?.roomName,
        userId
      );
      return { ok: true, ...grant };
    } catch (error) {
      return chatErrorCode(error);
    }
  }

  @SubscribeMessage('voice.leave')
  onVoiceLeave(): ChatSocketAck {
    return { ok: true };
  }

  /**
   * Nest ferme Socket.IO (et donc l'adaptateur) dans `dispose()`, après
   * `onModuleDestroy`. Ce hook s'exécute ensuite : les clients Redis dupliqués
   * peuvent alors être libérés sans provoquer « Connection is closed ».
   */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.extraClients.map((client) => client.quit()));
  }

  private async authenticate(socket: Socket): Promise<void> {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies.access_token;
    if (!token) throw new RealtimeAuthError('UNAUTHENTICATED');

    let payload;
    try {
      payload = verifyAccessToken(token, env.SESSION_SECRET);
    } catch {
      throw new RealtimeAuthError('UNAUTHENTICATED');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, expiresAt: true }
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new RealtimeAuthError('SESSION_REVOKED');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true }
    });
    if (!user || user.status === 'suspended' || user.status === 'deleted') {
      throw new RealtimeAuthError('SESSION_REVOKED');
    }

    socket.data.userId = user.id;
    socket.data.sessionId = payload.sid;
  }

  private applyRevocation(payload: string): void {
    let message: RealtimeRevocation;
    try {
      message = JSON.parse(payload) as RealtimeRevocation;
    } catch {
      return;
    }

    if (typeof message.userId === 'string') {
      this.sessions.revokeUser(message.userId);
    }
    if (typeof message.sessionId === 'string') {
      this.sessions.revokeSession(message.sessionId);
    }
    this.metrics.setRealtimeConnections(this.sessions.count());
  }
}
