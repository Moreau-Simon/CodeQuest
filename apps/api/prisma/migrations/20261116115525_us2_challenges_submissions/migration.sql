-- CreateEnum
CREATE TYPE "challenge_type" AS ENUM ('sorting', 'debugging', 'decryption', 'steganography', 'qr_code');

-- CreateEnum
CREATE TYPE "challenge_status" AS ENUM ('draft', 'validating', 'published', 'archived');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('pending', 'running', 'passed', 'failed', 'error', 'timeout', 'rejected');

-- CreateEnum
CREATE TYPE "subject_type" AS ENUM ('player', 'team');

-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lore_region_chapter_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "type" "challenge_type" NOT NULL,
    "difficulty" SMALLINT NOT NULL,
    "title" TEXT NOT NULL,
    "statement_md" TEXT NOT NULL,
    "languages" TEXT[],
    "base_points" INTEGER NOT NULL DEFAULT 100,
    "perf_max" INTEGER NOT NULL DEFAULT 0,
    "t_opt_ms" INTEGER NOT NULL,
    "t_max_ms" INTEGER NOT NULL,
    "status" "challenge_status" NOT NULL DEFAULT 'draft',
    "is_event_only" BOOLEAN NOT NULL DEFAULT false,
    "is_boss_phase" BOOLEAN NOT NULL DEFAULT false,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_versions" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "statement_snapshot" TEXT NOT NULL,
    "tests_encrypted" BYTEA,
    "reference_solution_encrypted" BYTEA,
    "key_id" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "challenge_version_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "team_id" UUID,
    "event_id" UUID,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'pending',
    "cpu_times_ms" INTEGER[],
    "cpu_time_median_ms" INTEGER,
    "tests_passed" INTEGER,
    "tests_total" INTEGER,
    "score" DECIMAL(12,2),
    "verdict_reason" TEXT,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "best_scores" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "score" DECIMAL(12,2) NOT NULL,
    "submission_id" UUID NOT NULL,
    "achieved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "best_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE INDEX "challenges_theme_id_idx" ON "challenges"("theme_id");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenge_versions_challenge_id_idx" ON "challenge_versions"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_versions_challenge_id_version_key" ON "challenge_versions"("challenge_id", "version");

-- CreateIndex
CREATE INDEX "submissions_challenge_id_score_created_at_idx" ON "submissions"("challenge_id", "score" DESC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "submissions_event_id_user_id_idx" ON "submissions"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "submissions_team_id_challenge_id_idx" ON "submissions"("team_id", "challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "best_scores_submission_id_key" ON "best_scores"("submission_id");

-- CreateIndex
CREATE INDEX "best_scores_subject_type_subject_id_idx" ON "best_scores"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "best_scores_challenge_id_subject_type_subject_id_key" ON "best_scores"("challenge_id", "subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_versions" ADD CONSTRAINT "challenge_versions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_versions" ADD CONSTRAINT "challenge_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challenge_version_id_fkey" FOREIGN KEY ("challenge_version_id") REFERENCES "challenge_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "best_scores" ADD CONSTRAINT "best_scores_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "best_scores" ADD CONSTRAINT "best_scores_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contraintes métier doublées en base (data-model.md §2, §3).
ALTER TABLE "challenges"
  ADD CONSTRAINT "challenges_difficulty_check" CHECK ("difficulty" BETWEEN 1 AND 5),
  ADD CONSTRAINT "challenges_title_length_check" CHECK (char_length("title") BETWEEN 3 AND 120),
  ADD CONSTRAINT "challenges_languages_check" CHECK (
    array_length("languages", 1) >= 1
    AND "languages" <@ ARRAY['python', 'javascript']::text[]
  ),
  ADD CONSTRAINT "challenges_points_check" CHECK ("base_points" >= 0 AND "perf_max" >= 0),
  ADD CONSTRAINT "challenges_times_check" CHECK ("t_opt_ms" > 0 AND "t_opt_ms" < "t_max_ms"),
  ADD CONSTRAINT "challenges_version_check" CHECK ("current_version" >= 1);

ALTER TABLE "challenge_versions"
  ADD CONSTRAINT "challenge_versions_version_check" CHECK ("version" >= 1);

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_language_check" CHECK ("language" IN ('python', 'javascript')),
  ADD CONSTRAINT "submissions_cpu_times_check" CHECK (
    "cpu_times_ms" IS NULL OR cardinality("cpu_times_ms") <= 7
  ),
  ADD CONSTRAINT "submissions_tests_check" CHECK (
    ("tests_passed" IS NULL OR "tests_passed" >= 0)
    AND ("tests_total" IS NULL OR "tests_total" >= 0)
    AND ("tests_passed" IS NULL OR "tests_total" IS NULL OR "tests_passed" <= "tests_total")
  ),
  ADD CONSTRAINT "submissions_score_check" CHECK ("score" IS NULL OR "score" >= 0),
  ADD CONSTRAINT "submissions_attempt_check" CHECK ("attempt_no" >= 1);

ALTER TABLE "best_scores"
  ADD CONSTRAINT "best_scores_score_check" CHECK ("score" >= 0);
