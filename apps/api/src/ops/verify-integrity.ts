/**
 * Vérification d'intégrité post-restauration (T251, T259, SC-014/SC-021).
 * Exécutable via `pnpm ops:verify-integrity`.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import '../config/env';
import { GLOBAL_SCOPE_ID } from '../modules/leaderboards/leaderboard.constants';
import { logger } from '../common/logging/logger';
import { MetricsService } from '../common/metrics/metrics.service';
import { verifyRestoreIntegrity } from '../modules/ops/restore-integrity';

/** Publie le résultat de la vérification pour l'alerte `BackupFailed` (T258). */
async function publishResult(status: 'success' | 'failure'): Promise<void> {
  const gateway = process.env.PUSHGATEWAY_URL;
  if (!gateway) return;

  const body = [
    '# HELP backup_last_result Résultat de la dernière vérification de sauvegarde',
    '# TYPE backup_last_result gauge',
    `backup_last_result{status="${status}"} 1`
  ].join('\n');

  try {
    const response = await fetch(
      `${gateway.replace(/\/$/, '')}/metrics/job/codequest-backup`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; version=0.0.4' },
        body
      }
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Publication du résultat de sauvegarde impossible');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Pushgateway indisponible : résultat non publié');
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let status: 'success' | 'failure' = 'failure';
  try {
    const [users, wallets, bestScores, leaderboardEntries] = await Promise.all([
      prisma.user.findMany({ select: { id: true, status: true, deletedAt: true } }),
      prisma.wallet.findMany({
        select: { userId: true, balance: true, transactions: { select: { amount: true } } }
      }),
      prisma.bestScore.findMany({
        select: { challengeId: true, subjectId: true, score: true }
      }),
      prisma.leaderboardEntry.findMany({
        where: { scopeType: 'global', scopeId: GLOBAL_SCOPE_ID },
        select: { subjectId: true, score: true, rank: true }
      })
    ]);

    const report = verifyRestoreIntegrity({
      users: users.map((user) => ({
        id: user.id,
        status: user.status,
        deletedAt: user.deletedAt
      })),
      wallets,
      bestScores: bestScores.map((score) => ({
        scopeType: 'global',
        scopeId: GLOBAL_SCOPE_ID,
        subjectId: score.subjectId,
        score: score.score.toString()
      })),
      leaderboardEntries: leaderboardEntries.map((entry) => ({
        scopeType: 'global',
        scopeId: GLOBAL_SCOPE_ID,
        subjectId: entry.subjectId,
        score: entry.score.toString(),
        rank: entry.rank
      }))
    });

    new MetricsService().recordIntegrityReport(report);

    if (!report.ok) {
      logger.error(
        { issues: report.issues },
        `Intégrité compromise (${report.issues.length} anomalie(s))`
      );
      process.exitCode = 1;
      return;
    }
    status = 'success';
    logger.info(`Intégrité vérifiée le ${report.checkedAt.toISOString()}`);
  } finally {
    await publishResult(status);
    await prisma.$disconnect();
  }
}

void main();
