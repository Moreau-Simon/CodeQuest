import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, type LeaderboardScopeType, type SubjectType } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.module';
import { LeaderboardGateway } from '../../realtime/leaderboard.gateway';
import {
  GLOBAL_SCOPE_ID,
  decodeLeaderboardScore,
  encodeLeaderboardScore,
  leaderboardKey,
  type LeaderboardPeriod
} from './leaderboard.constants';
import { periodWindow, type PeriodWindow } from './period.filter';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeaderboardItem {
  rank: number;
  subjectId: string;
  displayName: string;
  score: number;
  achievedAt: string;
}

export interface LeaderboardQueryInput {
  scope?: LeaderboardScopeType;
  scopeId?: string;
  period?: LeaderboardPeriod;
  cursor?: string;
  limit?: number;
  subjectType?: SubjectType;
  viewerId?: string;
}

export interface LeaderboardResult {
  scope: LeaderboardScopeType;
  scopeId: string;
  period: LeaderboardPeriod;
  subjectType: SubjectType;
  items: LeaderboardItem[];
  nextCursor: string | null;
  self: LeaderboardItem | null;
}

export interface RebuildReport {
  scopes: number;
  entries: number;
  mismatches: number;
  repaired: number;
}

export interface RetainedScoreInput {
  userId: string;
  challengeId: string;
  achievedAt: Date;
  teamId?: string | null;
  eventId?: string | null;
}

interface ScopeRef {
  type: LeaderboardScopeType;
  id: string;
  subjectType: SubjectType;
}

interface AggregatedRow {
  subject_id: string;
  display_name: string;
  score: string | number;
  tiebreak_at: Date;
}

interface RankedRow extends AggregatedRow {
  rank: number;
  scoreNumber: number;
}

interface SeasonRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Classements (US3, FR-045 → FR-049).
 *
 * - PostgreSQL (`best_scores`, `submissions`) est la source de vérité ;
 * - Redis ZSET est la lecture rapide, encodée par `encodeLeaderboardScore` ;
 * - `leaderboard_entries` est le miroir durable reconstruit périodiquement.
 *
 * Les filtres de période sont calculés en SQL sur la source de vérité : le
 * ZSET ne sert que pour « tout temps », ce qui garantit qu'un filtre ne peut
 * jamais afficher un score qui n'a pas été retenu.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly gateway: LeaderboardGateway
  ) {}

  // -------------------------------------------------------------------------
  // Lecture
  // -------------------------------------------------------------------------

  async query(input: LeaderboardQueryInput = {}): Promise<LeaderboardResult> {
    const scope = input.scope ?? 'global';
    const subjectType = input.subjectType ?? 'player';
    const period = input.period ?? 'all';
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const scopeId = this.normalizeScopeId(scope, input.scopeId);
    const offset = this.decodeCursor(input.cursor);

    const target: ScopeRef = { type: scope, id: scopeId, subjectType };
    const now = this.clock.now();
    const window = await this.resolveWindow(period, target, now);

    if (window.empty) {
      return this.result(target, period, [], null, null);
    }

    if (period !== 'all') {
      const ranked = this.rank(await this.aggregate(target, window));
      return this.pageFromRows(target, period, ranked, offset, limit, input.viewerId);
    }

    const key = leaderboardKey(target.type, target.id, target.subjectType);
    let raw = await this.redis.client.zrevrange(key, offset, offset + limit, 'WITHSCORES');

    if (raw.length === 0 && offset === 0) {
      // ZSET absent (redémarrage Redis, nouvelle portée) : reconstruction
      // paresseuse depuis PostgreSQL, uniquement si le miroir durable connaît
      // déjà cette portée. Sinon le job périodique la créera.
      const mirrored = await this.prisma.leaderboardEntry.count({
        where: {
          scopeType: target.type,
          scopeId: target.id,
          subjectType: target.subjectType
        }
      });
      if (mirrored > 0) {
        await this.rebuildScope(target);
        raw = await this.redis.client.zrevrange(key, offset, offset + limit, 'WITHSCORES');
      }
    }

    const entries: Array<{ subjectId: string; encoded: number }> = [];
    for (let index = 0; index < raw.length; index += 2) {
      entries.push({ subjectId: raw[index]!, encoded: Number(raw[index + 1]) });
    }

    const visible = entries.slice(0, limit);
    const nextCursor = entries.length > limit ? this.encodeCursor(offset + limit) : null;

    const rows = await this.mirrorByIds(
      target,
      visible.map((entry) => entry.subjectId)
    );
    const items: LeaderboardItem[] = [];
    for (const [index, entry] of visible.entries()) {
      const mirror = rows.get(entry.subjectId);
      const decoded = decodeLeaderboardScore(entry.encoded);
      items.push({
        rank: offset + index + 1,
        subjectId: entry.subjectId,
        displayName: mirror?.displayName ?? entry.subjectId.slice(0, 8),
        score: mirror ? Number(mirror.score) : decoded.score,
        achievedAt: (mirror?.tiebreakAt ?? decoded.achievedAt).toISOString()
      });
    }

    const self =
      target.subjectType === 'player' && input.viewerId
        ? await this.findViewerPosition(target, period, input.viewerId, window)
        : null;

    return {
      scope: target.type,
      scopeId: target.id,
      period,
      subjectType: target.subjectType,
      items,
      nextCursor,
      self
    };
  }

  // -------------------------------------------------------------------------
  // Mise à jour incrémentale (après commit PostgreSQL)
  // -------------------------------------------------------------------------

  /**
   * Répercute une soumission retenue sur toutes les portées concernées.
   * Appelé par le consommateur de verdicts **après** le commit : une erreur
   * Redis ne doit jamais invalider un verdict déjà enregistré, la
   * reconstruction périodique répare alors l'écart.
   */
  async recordRetainedScore(input: RetainedScoreInput): Promise<void> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: input.challengeId },
      select: { themeId: true }
    });
    if (!challenge) return;

    const scopes: ScopeRef[] = [
      { type: 'global', id: GLOBAL_SCOPE_ID, subjectType: 'player' },
      { type: 'theme', id: challenge.themeId, subjectType: 'player' }
    ];

    const season = await this.activeSeasonAt(input.achievedAt);
    if (season) {
      scopes.push({ type: 'season', id: season.id, subjectType: 'player' });
    }
    if (input.eventId) {
      scopes.push({ type: 'event', id: input.eventId, subjectType: 'player' });
    }
    if (input.teamId) {
      scopes.push({ type: 'team', id: input.teamId, subjectType: 'player' });
    }

    for (const scope of scopes) {
      try {
        await this.upsertSubject(scope, input.userId);
      } catch (error) {
        this.logger.error(
          `Mise à jour du classement ${scope.type}:${scope.id} impossible : ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * US8 (T150) : répercute la soumission officielle désignée par le capitaine
   * sur les classements d'équipe. Contrairement au classement interne
   * `lb:team:<id>:player`, aucune agrégation n'est faite : la source est
   * `best_scores(subject_type = 'team', subject_id = teamId)`.
   * Appelé après le commit PostgreSQL, comme `recordRetainedScore`.
   */
  async recordTeamScore(input: { teamId: string; challengeId: string; achievedAt: Date }): Promise<void> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: input.challengeId },
      select: { themeId: true }
    });
    if (!challenge) return;

    const scopes: ScopeRef[] = [
      { type: 'global', id: GLOBAL_SCOPE_ID, subjectType: 'team' },
      { type: 'theme', id: challenge.themeId, subjectType: 'team' }
    ];

    const season = await this.activeSeasonAt(input.achievedAt);
    if (season) scopes.push({ type: 'season', id: season.id, subjectType: 'team' });

    for (const scope of scopes) {
      try {
        await this.upsertSubject(scope, input.teamId);
      } catch (error) {
        this.logger.error(
          `Mise à jour du classement d'équipe ${scope.type}:${scope.id} impossible : ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Reconstruction et vérification (T098, SC-009)
  // -------------------------------------------------------------------------

  async rebuildAll(): Promise<RebuildReport> {
    const scopes = await this.listScopes();
    let entries = 0;
    for (const scope of scopes) {
      entries += await this.rebuildScope(scope);
    }

    const verification = await this.verifyIdentity(scopes);
    return {
      scopes: scopes.length,
      entries,
      mismatches: verification.mismatches,
      repaired: verification.repaired
    };
  }

  /** Vérifie que ZSET, miroir et agrégation PostgreSQL sont identiques. */
  async verifyIdentity(
    scopes?: ScopeRef[]
  ): Promise<{ scopes: number; mismatches: number; repaired: number }> {
    const targets = scopes ?? (await this.listScopes());
    let mismatches = 0;
    let repaired = 0;

    for (const scope of targets) {
      if (await this.scopeDiffers(scope)) {
        mismatches += 1;
        await this.rebuildScope(scope);
        repaired += 1;
      }
    }

    return { scopes: targets.length, mismatches, repaired };
  }

  // -------------------------------------------------------------------------
  // Interne — agrégation
  // -------------------------------------------------------------------------

  private async resolveWindow(
    period: LeaderboardPeriod,
    scope: ScopeRef,
    now: Date
  ): Promise<PeriodWindow> {
    if (period === 'all') return { since: null, until: null, empty: false };

    if (period === 'season') {
      const season =
        scope.type === 'season' ? await this.findSeason(scope.id) : await this.activeSeasonAt(now);
      return periodWindow('season', now, season);
    }

    return periodWindow(period, now);
  }

  private async aggregate(scope: ScopeRef, window: PeriodWindow): Promise<AggregatedRow[]> {
    if (window.empty) return [];
    if (scope.type === 'event') return this.aggregateEvent(scope, window);
    return this.aggregateBestScores(scope, window);
  }

  private async aggregateBestScores(
    scope: ScopeRef,
    window: PeriodWindow
  ): Promise<AggregatedRow[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`bs.subject_type = ${scope.subjectType}::subject_type`
    ];

    if (scope.type === 'theme') {
      conditions.push(Prisma.sql`c.theme_id = ${scope.id}::uuid`);
    }

    if (scope.type === 'season') {
      const season = await this.findSeason(scope.id);
      if (!season) return [];
      conditions.push(Prisma.sql`bs.achieved_at >= ${season.startsAt}`);
      conditions.push(Prisma.sql`bs.achieved_at < ${season.endsAt}`);
    }

    if (scope.type === 'team') {
      conditions.push(Prisma.sql`s.team_id = ${scope.id}::uuid`);
      conditions.push(Prisma.sql`bs.subject_type = 'player'::subject_type`);
    }

    if (window.since) conditions.push(Prisma.sql`bs.achieved_at >= ${window.since}`);
    if (window.until) conditions.push(Prisma.sql`bs.achieved_at < ${window.until}`);

    const displayName =
      scope.subjectType === 'player'
        ? Prisma.sql`u.pseudonym`
        : Prisma.sql`'Équipe ' || left(bs.subject_id::text, 8)`;

    return this.prisma.$queryRaw<AggregatedRow[]>(Prisma.sql`
      SELECT bs.subject_id,
             ${displayName} AS display_name,
             SUM(bs.score) AS score,
             MIN(bs.achieved_at) AS tiebreak_at
      FROM best_scores bs
      JOIN challenges c ON c.id = bs.challenge_id
      JOIN submissions s ON s.id = bs.submission_id
      LEFT JOIN users u ON bs.subject_type = 'player'::subject_type AND u.id = bs.subject_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY bs.subject_id, u.pseudonym
      ORDER BY score DESC, tiebreak_at ASC, bs.subject_id ASC
    `);
  }

  private async aggregateEvent(scope: ScopeRef, window: PeriodWindow): Promise<AggregatedRow[]> {
    const subjectColumn =
      scope.subjectType === 'team' ? Prisma.sql`s.team_id` : Prisma.sql`s.user_id`;
    const notNull =
      scope.subjectType === 'team'
        ? Prisma.sql`s.team_id IS NOT NULL`
        : Prisma.sql`s.user_id IS NOT NULL`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`s.event_id = ${scope.id}::uuid`,
      Prisma.sql`s.score IS NOT NULL`,
      notNull
    ];
    if (window.since) conditions.push(Prisma.sql`s.created_at >= ${window.since}`);
    if (window.until) conditions.push(Prisma.sql`s.created_at < ${window.until}`);

    const displayName =
      scope.subjectType === 'player'
        ? Prisma.sql`u.pseudonym`
        : Prisma.sql`'Équipe ' || left(r.subject_id::text, 8)`;

    return this.prisma.$queryRaw<AggregatedRow[]>(Prisma.sql`
      WITH retained AS (
        SELECT DISTINCT ON (${subjectColumn}, s.challenge_id)
               ${subjectColumn} AS subject_id,
               s.score,
               s.created_at
        FROM submissions s
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY ${subjectColumn}, s.challenge_id, s.score DESC, s.created_at ASC
      )
      SELECT r.subject_id,
             ${displayName} AS display_name,
             SUM(r.score) AS score,
             MIN(r.created_at) AS tiebreak_at
      FROM retained r
      LEFT JOIN users u ON u.id = r.subject_id
      GROUP BY r.subject_id, u.pseudonym
      ORDER BY score DESC, tiebreak_at ASC, r.subject_id ASC
    `);
  }

  /** Recalcule une seule entrée (mise à jour incrémentale) et son rang. */
  private async upsertSubject(scope: ScopeRef, subjectId: string): Promise<void> {
    const rows = await this.aggregate(scope, { since: null, until: null, empty: false });
    const row = rows.find((candidate) => candidate.subject_id === subjectId);
    const key = leaderboardKey(scope.type, scope.id, scope.subjectType);

    if (!row) {
      await this.redis.client.zrem(key, subjectId);
      await this.prisma.leaderboardEntry.deleteMany({
        where: {
          scopeType: scope.type,
          scopeId: scope.id,
          subjectType: scope.subjectType,
          subjectId
        }
      });
      return;
    }

    const encoded = encodeLeaderboardScore(row.score, row.tiebreak_at);
    await this.redis.client.zadd(key, encoded, subjectId);
    const zeroBasedRank = await this.redis.client.zrevrank(key, subjectId);
    if (zeroBasedRank === null) return;

    const rank = zeroBasedRank + 1;
    await this.prisma.leaderboardEntry.upsert({
      where: {
        scopeType_scopeId_subjectType_subjectId: {
          scopeType: scope.type,
          scopeId: scope.id,
          subjectType: scope.subjectType,
          subjectId
        }
      },
      create: {
        id: uuidv7(),
        scopeType: scope.type,
        scopeId: scope.id,
        subjectType: scope.subjectType,
        subjectId,
        displayName: row.display_name,
        score: row.score,
        tiebreakAt: row.tiebreak_at,
        rank
      },
      update: {
        displayName: row.display_name,
        score: row.score,
        tiebreakAt: row.tiebreak_at,
        rank,
        computedAt: new Date()
      }
    });

    this.gateway.updated(scope, 'all', [
      {
        rank,
        subjectId,
        displayName: row.display_name,
        score: Number(row.score)
      }
    ]);
  }

  // -------------------------------------------------------------------------
  // Interne — reconstruction
  // -------------------------------------------------------------------------

  private async rebuildScope(scope: ScopeRef): Promise<number> {
    const ranked = this.rank(
      await this.aggregate(scope, { since: null, until: null, empty: false })
    );
    const key = leaderboardKey(scope.type, scope.id, scope.subjectType);

    await this.prisma.$transaction([
      this.prisma.leaderboardEntry.deleteMany({
        where: { scopeType: scope.type, scopeId: scope.id, subjectType: scope.subjectType }
      }),
      ...this.chunk(ranked, 500).map((chunk) =>
        this.prisma.leaderboardEntry.createMany({
          data: chunk.map((row) => ({
            id: uuidv7(),
            scopeType: scope.type,
            scopeId: scope.id,
            subjectType: scope.subjectType,
            subjectId: row.subject_id,
            displayName: row.display_name,
            score: row.scoreNumber,
            tiebreakAt: row.tiebreak_at,
            rank: row.rank
          }))
        })
      )
    ]);

    const pipeline = this.redis.client.pipeline();
    pipeline.del(key);
    for (const row of ranked) {
      pipeline.zadd(key, encodeLeaderboardScore(row.scoreNumber, row.tiebreak_at), row.subject_id);
    }
    await pipeline.exec();

    return ranked.length;
  }

  private async scopeDiffers(scope: ScopeRef): Promise<boolean> {
    const expected = this.rank(
      await this.aggregate(scope, { since: null, until: null, empty: false })
    );
    const key = leaderboardKey(scope.type, scope.id, scope.subjectType);
    const raw = await this.redis.client.zrevrange(key, 0, -1, 'WITHSCORES');

    if (raw.length !== expected.length * 2) return true;

    for (const [index, row] of expected.entries()) {
      const member = raw[index * 2];
      const encoded = Number(raw[index * 2 + 1]);
      if (member !== row.subject_id) return true;
      const decoded = decodeLeaderboardScore(encoded);
      if (Math.abs(decoded.score - row.scoreNumber) > 0.001) return true;
      if (decoded.achievedAt.getTime() !== Math.floor(row.tiebreak_at.getTime() / 1_000) * 1_000) {
        return true;
      }
    }

    const mirror = await this.prisma.leaderboardEntry.findMany({
      where: { scopeType: scope.type, scopeId: scope.id, subjectType: scope.subjectType },
      select: { subjectId: true, rank: true }
    });
    if (mirror.length !== expected.length) return true;
    const ranks = new Map(mirror.map((entry) => [entry.subjectId, entry.rank]));
    return expected.some((row) => ranks.get(row.subject_id) !== row.rank);
  }

  private async listScopes(): Promise<ScopeRef[]> {
    const [themes, seasons, teamRows, eventRows] = await Promise.all([
      this.prisma.theme.findMany({ select: { id: true } }),
      this.prisma.season.findMany({ select: { id: true } }),
      this.prisma.submission.findMany({
        where: { teamId: { not: null } },
        distinct: ['teamId'],
        select: { teamId: true }
      }),
      this.prisma.submission.findMany({
        where: { eventId: { not: null } },
        distinct: ['eventId'],
        select: { eventId: true }
      })
    ]);

    const scopes: ScopeRef[] = [
      { type: 'global', id: GLOBAL_SCOPE_ID, subjectType: 'player' },
      { type: 'global', id: GLOBAL_SCOPE_ID, subjectType: 'team' }
    ];

    for (const theme of themes) {
      scopes.push({ type: 'theme', id: theme.id, subjectType: 'player' });
      scopes.push({ type: 'theme', id: theme.id, subjectType: 'team' });
    }
    for (const season of seasons) {
      scopes.push({ type: 'season', id: season.id, subjectType: 'player' });
      scopes.push({ type: 'season', id: season.id, subjectType: 'team' });
    }
    for (const row of teamRows) {
      if (row.teamId) scopes.push({ type: 'team', id: row.teamId, subjectType: 'player' });
    }
    for (const row of eventRows) {
      if (row.eventId) scopes.push({ type: 'event', id: row.eventId, subjectType: 'player' });
    }

    return scopes;
  }

  // -------------------------------------------------------------------------
  // Interne — pagination, saisons, miroir
  // -------------------------------------------------------------------------

  private rank(rows: AggregatedRow[]): RankedRow[] {
    return [...rows]
      .map((row) => ({ ...row, scoreNumber: Number(row.score) }))
      .sort((a, b) => {
        if (b.scoreNumber !== a.scoreNumber) return b.scoreNumber - a.scoreNumber;
        const time = a.tiebreak_at.getTime() - b.tiebreak_at.getTime();
        if (time !== 0) return time;
        return a.subject_id.localeCompare(b.subject_id);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  private pageFromRows(
    scope: ScopeRef,
    period: LeaderboardPeriod,
    ranked: RankedRow[],
    offset: number,
    limit: number,
    viewerId?: string
  ): LeaderboardResult {
    const visible = ranked.slice(offset, offset + limit);
    const items = visible.map((row) => this.toItem(row));
    const nextCursor = ranked.length > offset + limit ? this.encodeCursor(offset + limit) : null;
    const self =
      scope.subjectType === 'player' && viewerId
        ? ranked.find((row) => row.subject_id === viewerId)
        : undefined;

    return this.result(scope, period, items, nextCursor, self ? this.toItem(self) : null);
  }

  private toItem(row: RankedRow): LeaderboardItem {
    return {
      rank: row.rank,
      subjectId: row.subject_id,
      displayName: row.display_name,
      score: row.scoreNumber,
      achievedAt: row.tiebreak_at.toISOString()
    };
  }

  private result(
    scope: ScopeRef,
    period: LeaderboardPeriod,
    items: LeaderboardItem[],
    nextCursor: string | null,
    self: LeaderboardItem | null
  ): LeaderboardResult {
    return {
      scope: scope.type,
      scopeId: scope.id,
      period,
      subjectType: scope.subjectType,
      items,
      nextCursor,
      self
    };
  }

  private async findViewerPosition(
    scope: ScopeRef,
    period: LeaderboardPeriod,
    viewerId: string,
    window: PeriodWindow
  ): Promise<LeaderboardItem | null> {
    if (period !== 'all') {
      const ranked = this.rank(await this.aggregate(scope, window));
      const found = ranked.find((row) => row.subject_id === viewerId);
      return found ? this.toItem(found) : null;
    }

    const key = leaderboardKey(scope.type, scope.id, scope.subjectType);
    const zeroBasedRank = await this.redis.client.zrevrank(key, viewerId);
    if (zeroBasedRank === null) return null;

    const entries = await this.mirrorByIds(scope, [viewerId]);
    const mirror = entries.get(viewerId);
    if (!mirror) return null;

    return {
      rank: zeroBasedRank + 1,
      subjectId: viewerId,
      displayName: mirror.displayName,
      score: Number(mirror.score),
      achievedAt: mirror.tiebreakAt.toISOString()
    };
  }

  private async mirrorByIds(
    scope: ScopeRef,
    subjectIds: string[]
  ): Promise<Map<string, { displayName: string; score: number; tiebreakAt: Date }>> {
    if (subjectIds.length === 0) return new Map();
    const rows = await this.prisma.leaderboardEntry.findMany({
      where: {
        scopeType: scope.type,
        scopeId: scope.id,
        subjectType: scope.subjectType,
        subjectId: { in: subjectIds }
      },
      select: { subjectId: true, displayName: true, score: true, tiebreakAt: true }
    });
    return new Map(
      rows.map((row) => [
        row.subjectId,
        {
          displayName: row.displayName,
          score: Number(row.score),
          tiebreakAt: row.tiebreakAt
        }
      ])
    );
  }

  private normalizeScopeId(scope: LeaderboardScopeType, scopeId?: string): string {
    if (scope === 'global') return GLOBAL_SCOPE_ID;
    if (!scopeId) {
      throw new BadRequestException({
        code: 'INVALID_SCOPE',
        message: `La portée « ${scope} » exige un scopeId`
      });
    }
    if (!UUID_PATTERN.test(scopeId)) {
      throw new BadRequestException({
        code: 'INVALID_SCOPE',
        message: 'scopeId doit être un UUID'
      });
    }
    return scopeId;
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        o?: unknown;
      };
      if (typeof parsed.o !== 'number' || !Number.isInteger(parsed.o) || parsed.o < 0) {
        throw new Error('curseur invalide');
      }
      return parsed.o;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Curseur de pagination invalide'
      });
    }
  }

  private async findSeason(seasonId: string): Promise<SeasonRow | null> {
    return this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, startsAt: true, endsAt: true }
    });
  }

  private async activeSeasonAt(at: Date): Promise<SeasonRow | null> {
    return this.prisma.season.findFirst({
      where: { startsAt: { lte: at }, endsAt: { gt: at } },
      orderBy: { startsAt: 'desc' },
      select: { id: true, startsAt: true, endsAt: true }
    });
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
