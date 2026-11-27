-- US15 (FR-091 à FR-096) : canaux, messages, signalements et sanctions.
-- Les CHECK et l'index partiel du canal global ne sont pas exprimables en schema.prisma.

CREATE TYPE "chat_channel_kind" AS ENUM ('global', 'team', 'event', 'spectator');
CREATE TYPE "sanction_kind" AS ENUM ('mute', 'ban');
-- L'énumération `report_status` existait dans le schéma sans migration dédiée.
DO $$ BEGIN
    CREATE TYPE "report_status" AS ENUM ('open', 'reviewed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "chat_channels" (
    "id" UUID NOT NULL,
    "kind" "chat_channel_kind" NOT NULL,
    "scope_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_channels_kind_scope_unique" UNIQUE ("kind", "scope_id"),
    CONSTRAINT "chat_channels_name_not_empty" CHECK (char_length("name") > 0),
    CONSTRAINT "chat_channels_scope_required" CHECK (("kind" = 'global') = ("scope_id" IS NULL))
);

-- UNIQUE avec NULL autorise plusieurs canaux global : l'index partiel garantit l'unicité.
CREATE UNIQUE INDEX "chat_channels_global_unique" ON "chat_channels" ("kind") WHERE "kind" = 'global';

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "user_id" UUID,
    "author_label" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "client_message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_messages_client_message_unique" UNIQUE ("channel_id", "client_message_id"),
    CONSTRAINT "chat_messages_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000),
    CONSTRAINT "chat_messages_author_label_not_empty" CHECK (char_length("author_label") > 0)
);

CREATE TABLE "chat_reports" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_reports_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 500)
);

CREATE TABLE "chat_sanctions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel_id" UUID,
    "kind" "sanction_kind" NOT NULL,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "issued_by" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_sanctions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_sanctions_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 500),
    CONSTRAINT "chat_sanctions_ends_after_starts" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE INDEX "chat_messages_channel_created_idx" ON "chat_messages" ("channel_id", "created_at");
CREATE INDEX "chat_reports_status_idx" ON "chat_reports" ("status");
CREATE INDEX "chat_reports_message_idx" ON "chat_reports" ("message_id");
CREATE INDEX "chat_sanctions_user_ends_idx" ON "chat_sanctions" ("user_id", "ends_at");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "chat_channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_fkey"
    FOREIGN KEY ("message_id") REFERENCES "chat_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_resolver_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_sanctions" ADD CONSTRAINT "chat_sanctions_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_sanctions" ADD CONSTRAINT "chat_sanctions_issuer_fkey"
    FOREIGN KEY ("issued_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_sanctions" ADD CONSTRAINT "chat_sanctions_channel_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "chat_channels" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
