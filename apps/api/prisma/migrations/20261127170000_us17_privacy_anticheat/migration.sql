-- US17 (FR-114, FR-115) : consentement RGPD et signaux de similarité.
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" VARCHAR(64),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consents_user_purpose_unique" UNIQUE ("user_id", "purpose"),
    CONSTRAINT "consents_purpose_check" CHECK ("purpose" <> '')
);

CREATE INDEX "consents_user_idx" ON "consents" ("user_id");

CREATE TABLE "similarity_findings" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "submission_a_id" UUID NOT NULL,
    "submission_b_id" UUID NOT NULL,
    "score" DECIMAL(5, 4) NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "review" VARCHAR(16) NOT NULL DEFAULT 'human',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "similarity_findings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "similarity_findings_pair_unique" UNIQUE ("challenge_id", "submission_a_id", "submission_b_id"),
    CONSTRAINT "similarity_findings_status_check" CHECK ("status" IN ('open', 'dismissed', 'confirmed')),
    CONSTRAINT "similarity_findings_review_check" CHECK ("review" = 'human')
);

CREATE INDEX "similarity_findings_status_created_idx" ON "similarity_findings" ("status", "created_at");

ALTER TABLE "consents" ADD CONSTRAINT "consents_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "similarity_findings" ADD CONSTRAINT "similarity_findings_challenge_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
