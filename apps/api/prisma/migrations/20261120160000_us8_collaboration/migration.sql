-- US8 (FR-057, FR-059, FR-060) : documents collaboratifs Yjs et contribution individuelle.
-- Le document ne contient aucun userId : la purge RGPD (FR-013) n'a rien à y anonymiser.

CREATE TYPE "contribution_event_kind" AS ENUM ('kept_line', 'success', 'assistance');

CREATE TABLE "collaborative_documents" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "state" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collaborative_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contribution_events" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "contribution_event_kind" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "submission_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contribution_events_weight_check" CHECK ("weight" > 0)
);

CREATE TABLE "contribution_scores" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kept_lines" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "assistance" INTEGER NOT NULL DEFAULT 0,
    "coefficient" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contribution_scores_pkey" PRIMARY KEY ("team_id", "user_id")
);

CREATE UNIQUE INDEX "collaborative_documents_team_id_challenge_id_key"
    ON "collaborative_documents" ("team_id", "challenge_id");
CREATE INDEX "contribution_events_team_id_user_id_idx"
    ON "contribution_events" ("team_id", "user_id");
CREATE INDEX "contribution_events_challenge_id_user_id_idx"
    ON "contribution_events" ("challenge_id", "user_id");

ALTER TABLE "collaborative_documents" ADD CONSTRAINT "collaborative_documents_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaborative_documents" ADD CONSTRAINT "collaborative_documents_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_submission_id_fkey"
    FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contribution_scores" ADD CONSTRAINT "contribution_scores_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_scores" ADD CONSTRAINT "contribution_scores_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
