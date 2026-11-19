-- US6 — cours, progression et niveaux : contraintes d'intégrité sur les tables
-- socles créées en US5. La courbe d'XP reste configurable via platform_settings.

-- Statuts de publication et de progression (FR-051, FR-053).
ALTER TABLE "lessons"
    ADD CONSTRAINT "lessons_status_check"
    CHECK ("status" IN ('draft', 'published', 'archived'));

ALTER TABLE "lesson_progress"
    ADD CONSTRAINT "lesson_progress_status_check"
    CHECK ("status" IN ('not_started', 'in_progress', 'completed'));

ALTER TABLE "lesson_progress"
    ADD CONSTRAINT "lesson_progress_quiz_score_check"
    CHECK ("quiz_score" IS NULL OR ("quiz_score" >= 0 AND "quiz_score" <= 100));

-- Une leçon terminée porte toujours une date de complétion, et inversement.
ALTER TABLE "lesson_progress"
    ADD CONSTRAINT "lesson_progress_completed_at_check"
    CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));

-- Index d'aide au déblocage par niveau (FR-054) et au parcours d'une leçon.
CREATE INDEX "lore_chapters_required_level_idx" ON "lore_chapters" ("required_level");
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress" ("lesson_id");
