-- US16 (FR-104) : journal des notifications émises, idempotent par référence.
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "reference_id" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_kind_reference_unique" UNIQUE ("user_id", "kind", "reference_id")
);

CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
