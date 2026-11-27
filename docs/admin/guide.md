# Guide administrateur — CodeQuest

**Date** : 28 novembre 2026 · Public : comptes `admin` et `moderator`.

## 1. Rôles et permissions (RBAC)

Le catalogue des permissions `<domaine>:<action>` est dans
`apps/api/src/modules/rbac/permissions.ts`. Les permissions effectives sont calculées côté
serveur à partir des rôles (`player`, `moderator`, `admin`) et jointes à la requête ; le client
n'est jamais une source d'autorité.

| Rôle | Permissions notables |
|---|---|
| `player` | lire les défis, soumettre, participer aux événements, gérer son équipe, écrire dans les canaux, dépenser des Bits |
| `moderator` | ajoute lecture des comptes, suspension, modération des canaux et traitement des signalements |
| `admin` | toutes les permissions, dont publication de défis, réglages, ajustement économique et journal d'audit |

Vérifier toujours le rôle et la réauthentification récente de l'acteur pour une action sensible.

## 2. Publication d'un défi

1. Créer le défi et ses versions en `draft`, définir les prérequis (au plus une condition par
   prérequis, graphe acyclique) et charger les tests cachés chiffrés.
2. Jouer la solution de référence dans le bac à sable : aucun test caché ne doit apparaître dans
   les réponses REST, temps réel ou assets.
3. Lancer `POST /admin/challenges/:challengeId/validate` avec `challenge:validate`. Le service
   contrôle les invariants puis met le défi en `published` et trace `challenge.validated`.
4. Corriger le contenu via une **nouvelle version** : un défi publié n'est pas modifié en place.

## 3. Événements, classements et économie

- Créer un événement avec ses fenêtres UTC, son type (`standard` ou `battle_royale`) et, le cas
  échéant, sa règle d'élimination (seuil, pourcentage). Un événement à essai unique ne consomme
  l'essai qu'au démarrage explicite.
- Les classements sont calculés depuis les meilleurs scores ; après une restauration, contrôler
  l'absence de dérive avec `pnpm ops:verify-integrity`.
- Les ajustements manuels de Bits nécessitent `economy:adjust` et une clé d'idempotence ; ils
  sont écrits dans le registre, jamais appliqués directement au solde.
- Les coins d'administration (`/admin`) exposent tableau de bord, modération, réglages et audit.

## 4. Modération et conformité

- Traiter les signalements de messages avec `moderation:review` ; les sanctions passent par
  `POST /admin/chat/messages/:messageId/sanctions` et sont journalisées.
- La similarité Jaccard déclenche une revue humaine, jamais une sanction automatique.
- La suppression de compte anonymise les scores conservés ; vérifier qu'aucun identifiant direct
  ne subsiste dans les exports.
- Consulter le journal d'audit (`audit:read`) pour toute opération sensible.

## 5. Exploitation

- Surveiller `:9464/metrics` (runner) et les compteurs Prometheus de l'API, en particulier
  `runner_jobs_active`, `ledger_balance_mismatch_total` et `leaderboard_drift_total`.
- En cas de soumission bloquée, suivre `docs/operations/runbook-blocked-submission.md` ; pour une
  restauration, `docs/operations/runbook-restore.md` ; pour la clé AES,
  `docs/operations/runbook-aes-rotation.md`.
- La prise de poste est détaillée dans `docs/operations/onboarding.md`.
