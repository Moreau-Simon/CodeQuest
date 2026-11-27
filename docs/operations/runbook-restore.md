# Runbook — restauration (SC-014, SC-021)

**Date** : 28 novembre 2026 · **Objectif** : restauration complète en moins de 4 h.

## Principe

La source de vérité est PostgreSQL. La sauvegarde est un dump binaire `pg_dump -Fc`, produit
par `infra/backup/backup.sh`. Le workflow `.github/workflows/backup-verify.yml` rejoue chaque nuit
backup → restauration → contrôle d'intégrité et conserve les archives 90 jours.

## Procédure

```bash
# 1. Mettre l'API et le runner en arrêt contrôlé (aucune écriture pendant la restauration).
docker compose -f infra/docker-compose.yml stop api runner

# 2. Sauvegarder l'état courant avant toute manipulation (précaution, même en incident).
pnpm ops:backup backups/avant-restauration.dump

# 3. Restaurer : pg_restore --clean --if-exists puis contrôle automatique.
pnpm ops:restore backups/codequest-latest.dump

# 4. Contrôler les invariants métier.
pnpm ops:verify-integrity
```

Les secrets de base sont lus depuis `infra/secrets/*.txt` (jamais versionnés) via les variables
`POSTGRES_USER`, `POSTGRES_DB` et `PGPASSWORD`. Ne jamais coller de mot de passe dans un ticket.

## Vérification

- `verifyRestoreIntegrity` ne signale aucune anomalie : solde = somme signée du registre, scores
  du classement = meilleurs scores, comptes dans leur état d'origine (`status` / `deleted_at`).
- Anomalies possibles : `ledger_balance_mismatch`, `leaderboard_drift`,
  `account_state_inconsistent`. Elles incrémentent les compteurs Prometheus correspondants et
  déclenchent l'alerte `BackupFailed`.
- Après redémarrage, rejouer `pnpm test:integration` et vérifier une soumission de bout en bout
  (quickstart S2) avant de rouvrir l'inscription.

Si un écart persiste, ne pas « corriger » le solde à la main : restaurer une archive plus récente
ou reconstruire le classement depuis `best_scores` via la tâche prévue à cet effet.
