-- US7 — défis de débogage et de décryptage (FR-037 → FR-040, clarification A5).
-- Le code bogué est public ; la correction, les tests cachés et la graine ne le sont jamais.

ALTER TABLE "challenges"
    ADD COLUMN "buggy_code" TEXT,
    ADD COLUMN "max_modified_lines" INTEGER,
    ADD COLUMN "cipher" TEXT,
    ADD COLUMN "key_seed_ref" TEXT;

ALTER TABLE "submissions"
    ADD COLUMN "attempt_id" UUID,
    ADD COLUMN "modified_lines" INTEGER,
    ADD COLUMN "hints_used" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "verdict_at" TIMESTAMPTZ(6);

-- Tentative explicite : le chrono part de `started_at`, jamais de l'ouverture
-- de la page ni de la première soumission (FR-039, A5).
CREATE TABLE "challenge_attempts" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "expired_at" TIMESTAMPTZ(6) NOT NULL,
    "verdict_at" TIMESTAMPTZ(6),
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "modified_lines" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_attempts_pkey" PRIMARY KEY ("id")
);

-- Une seule tentative par (défi, joueur) est garantie au niveau relationnel (A5, FR-065).
CREATE UNIQUE INDEX "challenge_attempts_challenge_id_user_id_key"
    ON "challenge_attempts" ("challenge_id", "user_id");
CREATE INDEX "challenge_attempts_user_id_created_at_idx"
    ON "challenge_attempts" ("user_id", "created_at" DESC);

ALTER TABLE "challenge_attempts"
    ADD CONSTRAINT "challenge_attempts_challenge_id_fkey"
        FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "challenge_attempts_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_attempt_id_fkey"
        FOREIGN KEY ("attempt_id") REFERENCES "challenge_attempts" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "challenge_attempts"
    ADD CONSTRAINT "challenge_attempts_expired_after_started_check"
        CHECK ("expired_at" > "started_at"),
    ADD CONSTRAINT "challenge_attempts_verdict_after_started_check"
        CHECK ("verdict_at" IS NULL OR "verdict_at" >= "started_at"),
    ADD CONSTRAINT "challenge_attempts_hints_used_check"
        CHECK ("hints_used" >= 0),
    ADD CONSTRAINT "challenge_attempts_modified_lines_check"
        CHECK ("modified_lines" IS NULL OR "modified_lines" >= 0);

ALTER TABLE "challenges"
    ADD CONSTRAINT "challenges_max_modified_lines_check"
        CHECK ("max_modified_lines" IS NULL OR "max_modified_lines" > 0),
    ADD CONSTRAINT "challenges_cipher_check"
        CHECK ("cipher" IS NULL OR "cipher" IN ('xor', 'caesar', 'vigenere'));

ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_modified_lines_check"
        CHECK ("modified_lines" IS NULL OR "modified_lines" >= 0),
    ADD CONSTRAINT "submissions_hints_used_check"
        CHECK ("hints_used" >= 0);
