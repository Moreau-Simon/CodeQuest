import type { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import type { TestPlayer } from './teams';

export interface ChatFixture {
  readonly globalId: string;
  readonly teamId: string;
  readonly eventId: string;
  readonly spectatorId: string;
  readonly teamEntityId: string;
  readonly eventEntityId: string;
}

/**
 * Crée les quatre audiences de chat du contrat : global, équipe, événement
 * et spectateurs. Les trois premiers joueurs sont membres/participants, le
 * quatrième est volontairement extérieur aux canaux restreints.
 */
export async function seedChatFixture(options: {
  prisma: PrismaClient;
  slug: string;
  players: TestPlayer[];
  challengeId: string;
  now: Date;
}): Promise<ChatFixture> {
  const { prisma, slug, players, challengeId, now } = options;
  const [captain, member, spectator] = players;

  const team = await prisma.team.create({
    data: {
      id: uuidv7(),
      name: `Équipe ${slug.slice(-8)}`,
      tag: slug.replace(/[^a-z0-9]/gi, '').slice(-5),
      captainId: captain!.id,
      createdAt: now
    }
  });
  for (const [index, player] of [captain!, member!].entries()) {
    await prisma.teamMember.create({
      data: {
        id: uuidv7(),
        teamId: team.id,
        userId: player.id,
        role: index === 0 ? 'captain' : 'member',
        joinedAt: now
      }
    });
  }

  const event = await prisma.event.create({
    data: {
      id: uuidv7(),
      slug,
      title: slug,
      timezone: 'UTC',
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 3_600_000),
      status: 'open',
      type: 'battle_royale',
      minParticipants: 2,
      createdBy: captain!.id,
      challenges: { create: [{ challengeId, order: 1 }] }
    }
  });
  for (const player of [captain!, member!, spectator!]) {
    await prisma.eventParticipant.create({
      data: {
        id: uuidv7(),
        eventId: event.id,
        subjectType: 'player',
        subjectId: player.id,
        registeredAt: now,
        eliminatedAt: player.id === spectator!.id ? now : null
      }
    });
  }

  const global = await prisma.chatChannel.create({
    data: { id: uuidv7(), kind: 'global', scopeId: null, name: 'Global', createdAt: now }
  });
  const teamChannel = await prisma.chatChannel.create({
    data: { id: uuidv7(), kind: 'team', scopeId: team.id, name: 'Équipe', createdAt: now }
  });
  const eventChannel = await prisma.chatChannel.create({
    data: { id: uuidv7(), kind: 'event', scopeId: event.id, name: 'Événement', createdAt: now }
  });
  const spectatorChannel = await prisma.chatChannel.create({
    data: {
      id: uuidv7(),
      kind: 'spectator',
      scopeId: event.id,
      name: 'Spectateurs',
      createdAt: now
    }
  });

  return {
    globalId: global.id,
    teamId: teamChannel.id,
    eventId: eventChannel.id,
    spectatorId: spectatorChannel.id,
    teamEntityId: team.id,
    eventEntityId: event.id
  };
}
