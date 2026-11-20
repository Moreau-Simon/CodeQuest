-- US8 (FR-055, FR-056, FR-058, FR-046) : équipes, invitations et soumission officielle.
-- L'index partiel d'engagement unique est volontairement écrit en SQL brut :
-- Prisma ne sait pas exprimer `UNIQUE (...) WHERE ...`.

-- Une soumission peut être retenue à la fois comme meilleur score individuel
-- et comme soumission officielle de l'équipe (D4).
DROP INDEX IF EXISTS "best_scores_submission_id_key";
CREATE INDEX "best_scores_submission_id_idx" ON "best_scores" ("submission_id");

CREATE TYPE "team_member_role" AS ENUM ('captain', 'member');

CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "tag" CITEXT NOT NULL,
    "description" TEXT,
    "logo_key" TEXT,
    "captain_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disbanded_at" TIMESTAMPTZ(6),

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teams_name_key" UNIQUE ("name"),
    CONSTRAINT "teams_tag_key" UNIQUE ("tag"),
    CONSTRAINT "teams_name_length_check" CHECK (char_length("name") BETWEEN 3 AND 40),
    CONSTRAINT "teams_tag_length_check" CHECK (char_length("tag") BETWEEN 2 AND 6)
);

CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "team_member_role" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_user_id" UUID,
    "invited_pseudonym" CITEXT,
    "created_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_invitations_token_hash_key" UNIQUE ("token_hash")
);

CREATE TABLE "team_official_submissions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "designated_by" UUID,
    "designated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_official_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "team_official_submissions_team_id_challenge_id_key" UNIQUE ("team_id", "challenge_id")
);

-- Un seul engagement actif par joueur (FR-056). Les départs logiques
-- (`left_at` non null) libèrent la place pour une autre équipe.
CREATE UNIQUE INDEX "team_members_one_active_team_per_user"
    ON "team_members" ("user_id") WHERE "left_at" IS NULL;

CREATE INDEX "teams_disbanded_at_idx" ON "teams" ("disbanded_at");
CREATE INDEX "team_members_team_id_left_at_idx" ON "team_members" ("team_id", "left_at");
CREATE INDEX "team_members_user_id_left_at_idx" ON "team_members" ("user_id", "left_at");
CREATE INDEX "team_invitations_team_id_expires_at_idx" ON "team_invitations" ("team_id", "expires_at");

ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_official_submissions" ADD CONSTRAINT "team_official_submissions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_official_submissions" ADD CONSTRAINT "team_official_submissions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_official_submissions" ADD CONSTRAINT "team_official_submissions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_official_submissions" ADD CONSTRAINT "team_official_submissions_designated_by_fkey" FOREIGN KEY ("designated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
