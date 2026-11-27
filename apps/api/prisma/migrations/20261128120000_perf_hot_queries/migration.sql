-- T262 : index des requêtes chaudes identifiés lors de l'audit de la Phase 20.
-- Catalogue trié/paginé, classements par période, agrégation d'événement et
-- liste d'utilisateurs cursorisée. Aucune donnée n'est modifiée.

CREATE INDEX "challenges_status_difficulty_title_id_idx"
    ON "challenges" ("status", "difficulty", "title", "id");

CREATE INDEX "best_scores_subject_type_achieved_at_idx"
    ON "best_scores" ("subject_type", "achieved_at");

CREATE INDEX "submissions_event_team_challenge_score_created_idx"
    ON "submissions" ("event_id", "team_id", "challenge_id", "score" DESC, "created_at" ASC);

CREATE INDEX "users_created_at_idx"
    ON "users" ("created_at" DESC);
