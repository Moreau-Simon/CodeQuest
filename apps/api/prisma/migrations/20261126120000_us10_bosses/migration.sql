-- US10 — boss, phases et points de vie (FR-066 à FR-071).

CREATE TABLE "bosses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lore_chapter_id" UUID NOT NULL,
    "max_hp" INTEGER NOT NULL,
    "rewards" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bosses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bosses_slug_key" UNIQUE ("slug"),
    CONSTRAINT "bosses_max_hp_check" CHECK ("max_hp" > 0)
);

CREATE TABLE "boss_phases" (
    "id" UUID NOT NULL,
    "boss_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "challenge_id" UUID NOT NULL,
    "hp_share" DECIMAL(5,2) NOT NULL,
    "damage_rule" JSONB NOT NULL,
    CONSTRAINT "boss_phases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "boss_phases_boss_id_order_key" UNIQUE ("boss_id", "order"),
    CONSTRAINT "boss_phases_hp_share_check" CHECK ("hp_share" > 0 AND "hp_share" <= 100)
);

CREATE TABLE "player_health" (
    "id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "max_hp" INTEGER NOT NULL DEFAULT 100,
    "ko_until" TIMESTAMPTZ(6),
    "last_regen_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "player_health_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "player_health_subject_type_subject_id_key" UNIQUE ("subject_type", "subject_id"),
    CONSTRAINT "player_health_hp_check" CHECK ("hp" >= 0 AND "hp" <= "max_hp"),
    CONSTRAINT "player_health_max_hp_check" CHECK ("max_hp" > 0)
);

CREATE TABLE "boss_engagements" (
    "id" UUID NOT NULL,
    "boss_id" UUID NOT NULL,
    "subject_type" "subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "boss_hp_remaining" INTEGER,
    "phase_reached" INTEGER NOT NULL DEFAULT 1,
    "defeated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "boss_engagements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "boss_engagements_boss_id_subject_type_subject_id_key" UNIQUE ("boss_id", "subject_type", "subject_id"),
    CONSTRAINT "boss_engagements_phase_reached_check" CHECK ("phase_reached" >= 1),
    CONSTRAINT "boss_engagements_boss_hp_check" CHECK ("boss_hp_remaining" IS NULL OR "boss_hp_remaining" >= 0)
);

ALTER TABLE "submissions" ADD COLUMN "boss_phase_id" UUID;

CREATE INDEX "bosses_lore_chapter_id_idx" ON "bosses"("lore_chapter_id");
CREATE INDEX "boss_phases_challenge_id_idx" ON "boss_phases"("challenge_id");
CREATE INDEX "boss_engagements_subject_idx" ON "boss_engagements"("subject_type", "subject_id");
CREATE INDEX "submissions_boss_phase_id_idx" ON "submissions"("boss_phase_id");

ALTER TABLE "bosses" ADD CONSTRAINT "bosses_lore_chapter_id_fkey"
    FOREIGN KEY ("lore_chapter_id") REFERENCES "lore_chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "boss_phases" ADD CONSTRAINT "boss_phases_boss_id_fkey"
    FOREIGN KEY ("boss_id") REFERENCES "bosses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boss_phases" ADD CONSTRAINT "boss_phases_challenge_id_fkey"
    FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "boss_engagements" ADD CONSTRAINT "boss_engagements_boss_id_fkey"
    FOREIGN KEY ("boss_id") REFERENCES "bosses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_boss_phase_id_fkey"
    FOREIGN KEY ("boss_phase_id") REFERENCES "boss_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
