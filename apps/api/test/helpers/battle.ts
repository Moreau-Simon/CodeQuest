import type { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import type { TestApp } from './app';
import type { TestPlayer } from './teams';

export interface BattleFixture {
  readonly eventId: string;
  readonly challengeId: string;
  readonly players: TestPlayer[];
}

/** Crée un event battle_royale ouvert et inscrit les joueurs fournis. */
export async function seedBattleFixture(options: {
  api: TestApp;
  prisma: PrismaClient;
  slug: string;
  players: TestPlayer[];
  challengeId: string;
  startsAt: Date;
  endsAt: Date;
  minParticipants?: number;
  creatorId: string;
}): Promise<BattleFixture> {
  const { prisma, slug, players, challengeId, startsAt, endsAt, creatorId } = options;
  const event = await prisma.event.create({
    data: {
      id: uuidv7(),
      slug,
      title: slug,
      timezone: 'UTC',
      startsAt,
      endsAt,
      status: 'open',
      type: 'battle_royale',
      minParticipants: options.minParticipants ?? 8,
      createdBy: creatorId,
      challenges: { create: [{ challengeId, order: 1 }] }
    }
  });

  for (const player of players) {
    const response = await player.agent.post(`/api/v1/events/${event.id}/join`);
    if (response.status !== 201) {
      throw new Error(`Inscription battle royale refusée (${response.status})`);
    }
  }

  return { eventId: event.id, challengeId, players };
}
