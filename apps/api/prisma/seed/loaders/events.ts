import { Prisma, type PrismaClient } from '@prisma/client';
import { EVENTS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';
import { challengeIdFor } from './lookup';

/** Événements, parcours ordonné et manches synchronisées des battle royales. */
export async function seedEventsCatalog(prisma: PrismaClient): Promise<number> {
  for (const event of EVENTS) {
    const eventId = (
      await prisma.event.upsert({
        where: { slug: event.slug },
        update: {
          title: event.title,
          timezone: event.timezone,
          startsAt: new Date(event.startsAt),
          endsAt: new Date(event.endsAt),
          status: event.status,
          type: event.type,
          maxAttempts: event.maxAttempts,
          minParticipants: event.minParticipants,
          eliminationRule: event.eliminationRule as unknown as Prisma.InputJsonValue,
          rewards: event.rewards as unknown as Prisma.InputJsonValue
        },
        create: {
          id: uuidv7(),
          slug: event.slug,
          title: event.title,
          timezone: event.timezone,
          startsAt: new Date(event.startsAt),
          endsAt: new Date(event.endsAt),
          status: event.status,
          type: event.type,
          maxAttempts: event.maxAttempts,
          minParticipants: event.minParticipants,
          eliminationRule: event.eliminationRule as unknown as Prisma.InputJsonValue,
          rewards: event.rewards as unknown as Prisma.InputJsonValue
        },
        select: { id: true }
      })
    ).id;

    for (const [index, slug] of event.challengeSlugs.entries()) {
      const challengeId = await challengeIdFor(prisma, slug);
      if (!challengeId)
        throw new Error(`Défi introuvable pour l’événement ${event.slug} : ${slug}`);
      await prisma.eventChallenge.upsert({
        where: { eventId_challengeId: { eventId, challengeId } },
        update: { order: index + 1 },
        create: { eventId, challengeId, order: index + 1 }
      });
    }

    for (const round of event.rounds) {
      const challengeId = await challengeIdFor(prisma, round.challengeSlug);
      if (!challengeId)
        throw new Error(`Défi introuvable pour la manche ${event.slug}/${round.roundNumber}`);
      await prisma.battleRound.upsert({
        where: { eventId_roundNumber: { eventId, roundNumber: round.roundNumber } },
        update: {
          challengeId,
          startsAt: new Date(round.startsAt),
          endsAt: new Date(round.endsAt),
          status: round.status
        },
        create: {
          id: uuidv7(),
          eventId,
          roundNumber: round.roundNumber,
          challengeId,
          startsAt: new Date(round.startsAt),
          endsAt: new Date(round.endsAt),
          status: round.status
        }
      });
    }
  }
  return EVENTS.length;
}
