-- Le journal d'audit est append-only : le trigger `audit_logs_no_update`
-- interdit toute mise à jour, y compris le `SET NULL` provoqué par la
-- suppression d'un acteur. La référence est donc protégée par `RESTRICT` :
-- un compte référencé par l'audit n'est jamais supprimé physiquement, il est
-- anonymisé (purge à J+30, `AccountPurgeJob`).
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
