-- US5 — catalogue, prérequis acycliques et parcours pédagogique

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_md" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "positioning_test" JSONB,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "quiz_score" INTEGER,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("user_id", "lesson_id")
);

-- CreateTable
CREATE TABLE "lore_chapters" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_md" TEXT NOT NULL,
    "required_level" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "audio_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lore_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lore_progress" (
    "user_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "lore_progress_pkey" PRIMARY KEY ("user_id", "chapter_id")
);

-- CreateTable
CREATE TABLE "challenge_prerequisites" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "required_challenge_id" UUID,
    "required_level" INTEGER,
    "required_lesson_id" UUID,
    "required_lore_chapter_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_prerequisites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "challenge_prerequisites_exclusivity_check" CHECK (
        (("required_challenge_id" IS NOT NULL)::int +
         ("required_level" IS NOT NULL)::int +
         ("required_lesson_id" IS NOT NULL)::int +
         ("required_lore_chapter_id" IS NOT NULL)::int) = 1
    ),
    CONSTRAINT "challenge_prerequisites_level_check" CHECK (
        "required_level" IS NULL OR "required_level" >= 1
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "lessons_slug_key" ON "lessons"("slug");
CREATE INDEX "lessons_theme_id_idx" ON "lessons"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "lore_chapters_slug_key" ON "lore_chapters"("slug");

-- CreateIndex
CREATE INDEX "challenge_prerequisites_challenge_id_idx" ON "challenge_prerequisites"("challenge_id");
CREATE INDEX "challenge_prerequisites_required_challenge_id_idx" ON "challenge_prerequisites"("required_challenge_id");
CREATE INDEX "challenge_prerequisites_required_lesson_id_idx" ON "challenge_prerequisites"("required_lesson_id");
CREATE INDEX "challenge_prerequisites_required_lore_chapter_id_idx" ON "challenge_prerequisites"("required_lore_chapter_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lore_progress" ADD CONSTRAINT "lore_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lore_progress" ADD CONSTRAINT "lore_progress_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "lore_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_prerequisites" ADD CONSTRAINT "challenge_prerequisites_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_prerequisites" ADD CONSTRAINT "challenge_prerequisites_required_challenge_id_fkey" FOREIGN KEY ("required_challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_prerequisites" ADD CONSTRAINT "challenge_prerequisites_required_lesson_id_fkey" FOREIGN KEY ("required_lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_prerequisites" ADD CONSTRAINT "challenge_prerequisites_required_lore_chapter_id_fkey" FOREIGN KEY ("required_lore_chapter_id") REFERENCES "lore_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
