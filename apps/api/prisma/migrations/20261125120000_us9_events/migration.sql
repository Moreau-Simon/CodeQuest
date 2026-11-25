-- US9 (FR-061 à FR-065) : événements à essai unique.
-- Les CHECK ci-dessous ne peuvent pas être exprimés dans schema.prisma ;
-- la validité IANA de `timezone` est vérifiée par l'API (Intl.supportedValuesOf).

CREATE TYPE "event_status" AS ENUM ('draft', 'scheduled', 'open', 'finished', 'archived');
CREATE TYPE "event_type" AS ENUM ('standard', 'battle_royale');

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "type" "event_type" NOT NULL DEFAULT 'standard',
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "min_participants" INTEGER NOT NULL DEFAULT 8,
    "elimination_rule" JSONB NOT NULL DEFAULT '{"threshold":50,"percent":10}',
    "rewards" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "events_ends_after_starts" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "events_max_attempts_one" CHECK ("max_attempts" = 1)
);

CREATE TABLE "event_challenges" (
    "event_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "event_challenges_pkey" PRIMARY KEY ("event_id", "challenge_id")
);

CREATE TABLE "event_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_started_at" TIMESTAMPTZ(6),
    "attempt_consumed_at" TIMESTAMPTZ(6),
    "eliminated_at" TIMESTAMPTZ(6),

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");
CREATE INDEX "event_challenges_event_id_order_idx" ON "event_challenges"("event_id", "order");
CREATE UNIQUE INDEX "event_participants_event_id_subject_type_subject_id_key" ON "event_participants"("event_id", "subject_type", "subject_id");
CREATE INDEX "event_participants_event_id_eliminated_at_idx" ON "event_participants"("event_id", "eliminated_at");

ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_challenges" ADD CONSTRAINT "event_challenges_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_challenges" ADD CONSTRAINT "event_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
