import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { Clock } from '../../common/clock';
import { env } from '../../config/env';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { ChatService } from './chat.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VoiceGrant {
  token: string;
  url: string;
  expiresAt: string;
}

/**
 * T233 (FR-095/FR-096) : jeton LiveKit de courte durée, délivré seulement
 * après vérification de l'appartenance au canal. Aucune permission
 * d'enregistrement n'est accordée : seules les publications microphone sont
 * autorisées, et le jeton n'est jamais placé dans une URL.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly clock: Clock,
    private readonly chat: ChatService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway
  ) {}

  async authorize(roomName: unknown, userId: string): Promise<VoiceGrant> {
    if (typeof roomName !== 'string' || !roomName.startsWith('channel:')) {
      throw new BadRequestException({ code: 'INVALID_PAYLOAD', message: 'Salon invalide' });
    }
    const channelId = roomName.slice('channel:'.length);
    if (!UUID_PATTERN.test(channelId)) {
      throw new BadRequestException({ code: 'INVALID_PAYLOAD', message: 'Salon invalide' });
    }
    await this.chat.assertAccess(channelId, userId);

    const now = this.clock.now();
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const expiresAt = new Date(now.getTime() + env.LIVEKIT_TOKEN_TTL_SECONDS * 1_000);
    const token = jwt.sign(
      {
        iss: env.LIVEKIT_API_KEY,
        sub: userId,
        iat: issuedAt,
        exp: Math.floor(expiresAt.getTime() / 1_000),
        video: {
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishSources: ['microphone']
        }
      },
      env.LIVEKIT_API_SECRET,
      { algorithm: 'HS256' }
    );

    this.realtime.emitToUser(userId, 'voice.token', {
      roomName,
      token,
      expiresAt: expiresAt.toISOString()
    });
    return { token, url: env.LIVEKIT_URL, expiresAt: expiresAt.toISOString() };
  }
}
