-- Le banc de questions sert uniquement au mini-quiz pédagogique (FR-051).
-- Le test de positionnement (FR-052) est supprimé : renommage sans perte de données.
ALTER TABLE "lessons" RENAME COLUMN "positioning_test" TO "quiz";
