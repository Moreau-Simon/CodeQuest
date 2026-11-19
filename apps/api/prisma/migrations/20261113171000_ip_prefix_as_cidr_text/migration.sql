-- Les préfixes sont stockés sous forme CIDR (« 203.0.113.0/24 », « ::/48 »).
-- Le type `inet` de PostgreSQL accepte cette écriture, mais le client Prisma
-- ne sérialise que des adresses IP nues (`AddrParseError(Ip)` sinon). Le
-- contrat applicatif reste inchangé : la colonne porte un préfixe réseau
-- minimisé, contrôlé par une contrainte de format.
ALTER TABLE "sessions"
  ALTER COLUMN "ip_prefix" TYPE text USING "ip_prefix"::text;

ALTER TABLE "audit_logs"
  ALTER COLUMN "ip_prefix" TYPE text USING "ip_prefix"::text;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_ip_prefix_check"
    CHECK ("ip_prefix" IS NULL OR "ip_prefix" ~ '^[0-9a-fA-F:.]+/[0-9]{1,3}$');

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_ip_prefix_check"
    CHECK ("ip_prefix" IS NULL OR "ip_prefix" ~ '^[0-9a-fA-F:.]+/[0-9]{1,3}$');
