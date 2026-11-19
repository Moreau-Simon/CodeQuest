import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermissions } from '../rbac/rbac.constants';

/**
 * Statistiques administratives (T112, FR-050, FR-083).
 */
@Controller('admin/stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('user:read')
  @Get()
  async getStats() {
    const [activeUsers, totalSubmissions, passedSubmissions, pendingSubmissions] =
      await Promise.all([
        this.prisma.user.count({ where: { status: 'active' } }),
        this.prisma.submission.count(),
        this.prisma.submission.count({ where: { status: 'passed' } }),
        this.prisma.submission.count({ where: { status: 'pending' } })
      ]);

    const successRate =
      totalSubmissions > 0 ? Math.round((passedSubmissions / totalSubmissions) * 1000) / 10 : 0;

    const popularChallengesRaw = await this.prisma.submission.groupBy({
      by: ['challengeId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const challengeIds = popularChallengesRaw.map((p) => p.challengeId);
    const challenges = await this.prisma.challenge.findMany({
      where: { id: { in: challengeIds } },
      select: { id: true, title: true, difficulty: true }
    });

    const challengeMap = new Map(challenges.map((c) => [c.id, c]));
    const popularChallenges = popularChallengesRaw.map((p) => ({
      challengeId: p.challengeId,
      title: challengeMap.get(p.challengeId)?.title ?? 'Inconnu',
      difficulty: challengeMap.get(p.challengeId)?.difficulty ?? 1,
      submissionsCount: p._count.id
    }));

    return {
      activeUsers,
      totalSubmissions,
      passedSubmissions,
      pendingSubmissions,
      successRate,
      popularChallenges
    };
  }
}
