-- US3 — classements : saisons, miroir durable et portées.

-- CreateEnum
CREATE TYPE "leaderboard_scope_type" AS ENUM ('global', 'theme', 'season', 'event', 'team');

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seasons_window_check" CHECK ("ends_at" > "starts_at")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" UUID NOT NULL,
    "scope_type" "leaderboard_scope_type" NOT NULL,
    "scope_id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "score" DECIMAL(12,2) NOT NULL,
    "tiebreak_at" TIMESTAMPTZ(6) NOT NULL,
    "rank" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leaderboard_entries_score_check" CHECK ("score" >= 0),
    CONSTRAINT "leaderboard_entries_rank_check" CHECK ("rank" >= 1),
    CONSTRAINT "leaderboard_entries_global_scope_check" CHECK (
        ("scope_type" = 'global'
            AND "scope_id" = '00000000-0000-0000-0000-000000000000'::uuid)
        OR ("scope_type" <> 'global')
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_slug_key" ON "seasons"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_scope_type_scope_id_subject_type_subject_id_key"
    ON "leaderboard_entries"("scope_type", "scope_id", "subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "leaderboard_entries_scope_type_scope_id_score_tiebreak_at_idx"
    ON "leaderboard_entries"("scope_type", "scope_id", "score" DESC, "tiebreak_at" ASC);

-- CreateIndex
CREATE INDEX "seasons_window_idx" ON "seasons"("starts_at", "ends_at");
