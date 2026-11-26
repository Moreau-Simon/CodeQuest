import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';

export interface LoreChapterView {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly requiredLevel: number;
  readonly order: number;
  readonly audioKey: string | null;
  readonly unlocked: boolean;
  readonly read: boolean;
  readonly readAt: string | null;
  /** Markdown du chapitre, uniquement pour les lecteurs autorisés (FR-078). */
  readonly content?: string;
}

/** Chapitres narratifs (US12, FR-078 et FR-003). */
@Injectable()
export class LoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Catalogue public : le contenu n'est joint que pour les chapitres débloqués. */
  async list(userId?: string): Promise<LoreChapterView[]> {
    const chapters = await this.prisma.loreChapter.findMany({
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        contentMd: true,
        requiredLevel: true,
        order: true,
        audioKey: true
      }
    });

    let level = 0;
    let readable = false;
    let progress: { chapterId: string; readAt: Date | null }[] = [];
    if (userId) {
      const [user, records] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { level: true, status: true }
        }),
        this.prisma.loreProgress.findMany({
          where: { userId },
          select: { chapterId: true, readAt: true }
        })
      ]);
      // FR-003 : un compte non confirmé peut lire le lore public ; seules les
      // écritures exigent un e-mail confirmé (cf. `markRead`).
      readable = !!user && user.status !== 'suspended' && user.status !== 'deleted';
      level = user && readable ? user.level : 0;
      progress = records;
    }
    const reads = new Map(progress.map((record) => [record.chapterId, record.readAt]));

    return chapters.map((chapter) => {
      const unlocked = readable && level >= chapter.requiredLevel;
      const readAt = reads.get(chapter.id) ?? null;
      return {
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        requiredLevel: chapter.requiredLevel,
        order: chapter.order,
        audioKey: chapter.audioKey,
        unlocked,
        read: readAt !== null,
        readAt: readAt?.toISOString() ?? null,
        ...(unlocked ? { content: chapter.contentMd } : {})
      };
    });
  }

  /** Marque un chapitre débloqué comme lu ; rejouer la requête conserve la date initiale. */
  async markRead(userId: string, chapterId: string): Promise<LoreChapterView> {
    const chapter = await this.prisma.loreChapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      throw new NotFoundException({
        code: 'LORE_CHAPTER_NOT_FOUND',
        message: 'Chapitre de lore introuvable'
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { level: true, status: true, emailVerifiedAt: true }
    });
    if (!user || user.status !== 'active' || !user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour suivre votre lecture'
      });
    }
    if (user.level < chapter.requiredLevel) {
      throw new ConflictException({
        code: 'LORE_CHAPTER_LOCKED',
        message: 'Ce chapitre nécessite un niveau supérieur',
        details: { level: user.level, requiredLevel: chapter.requiredLevel }
      });
    }

    const now = this.clock.now();
    await this.prisma.runInTransaction(async (tx) => {
      const key = { userId_chapterId: { userId, chapterId } };
      const existing = await tx.loreProgress.findUnique({ where: key });
      if (!existing) {
        await tx.loreProgress.create({
          data: { userId, chapterId, unlockedAt: now, readAt: now }
        });
      } else if (!existing.readAt) {
        await tx.loreProgress.update({ where: key, data: { readAt: now } });
      }
    });

    const view = (await this.list(userId)).find((candidate) => candidate.id === chapterId);
    if (!view) {
      throw new NotFoundException({
        code: 'LORE_CHAPTER_NOT_FOUND',
        message: 'Chapitre de lore introuvable'
      });
    }
    return view;
  }
}
