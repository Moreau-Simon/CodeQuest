-- US14 (FR-097 à FR-101) : manches synchronisées et résultats par sujet.
-- Les CHECK ne peuvent pas être exprimés dans schema.prisma.

CREATE TYPE "round_status" AS ENUM ('scheduled', 'open', 'closed');

CREATE TABLE "battle_rounds" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "challenge_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "round_status" NOT NULL DEFAULT 'scheduled',
    "warning_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_rounds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "battle_rounds_event_round_unique" UNIQUE ("event_id", "round_number"),
    CONSTRAINT "battle_rounds_round_number_positive" CHECK ("round_number" >= 1),
    CONSTRAINT "battle_rounds_ends_after_starts" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "round_results" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "submission_id" UUID,
    "score" DECIMAL(12, 2),
    "submitted_at" TIMESTAMPTZ(6),
    "eliminated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "round_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "round_results_subject_unique" UNIQUE ("round_id", "subject_type", "subject_id")
);

CREATE INDEX "battle_rounds_event_status_starts_idx" ON "battle_rounds"("event_id", "status", "starts_at");
CREATE INDEX "round_results_round_score_idx" ON "round_results"("round_id", "score");

ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_challenge_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_round_fkey"
    FOREIGN KEY ("round_id") REFERENCES "battle_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "round_results" ADD CONSTRAINT "round_results_submission_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
