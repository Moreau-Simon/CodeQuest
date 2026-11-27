# Onboarding des mainteneurs

**Date** : 28 novembre 2026 · Public : personnes habilitées à administrer la plateforme.

## 1. Accès et rôles

1. Créer le compte via l'interface puis confirmer l'adresse e-mail (aucun accès avant
   `emailVerifiedAt`).
2. Attribuer le rôle minimal : `player`, `moderator` ou `admin`. Les permissions effectives
   proviennent de `role_permissions` ; le garde RBAC refuse par défaut toute route sans
   `@RequirePermissions`.
3. Vérifier le rôle avec `GET /me` et, pour une action sensible, la réauthentification récente
   (`authenticatedAt`).
4. `moderator` ajoute `user:read`, `user:ban`, `chat:moderate`, `moderation:review` ;
   `admin` détient toutes les permissions, y compris `challenge:validate`,
   `settings:write`, `economy:adjust` et `audit:read`.

## 2. Validation de défi

1. Le défi est créé en `draft` par un auteur (`challenge:write`).
2. Vérifier les énoncés publics, les tests cachés chiffrés, la version du contrat
   `runner-job.md` et les prérequis (DAG acyclique, exclusivité des quatre conditions).
3. Exécuter la solution de référence dans le bac à sable, puis lancer
   `POST /admin/challenges/:challengeId/validate` (`challenge:validate`).
4. La validation met le défi en `published` et écrit `challenge.validated` dans le journal
   d'audit. Un défi publié ne peut plus être modifié sans nouvelle version.
5. Contrôle qualité : rejouer `pnpm test:integration` et vérifier qu'aucun test caché n'apparaît
   dans les réponses (quickstart S3).

## 3. Modération

- Les signalements arrivent via `POST /channels/:channelId/messages/:messageId/reports` et sont
  traités avec `moderation:review`.
- Les sanctions (suppression de message, mute, suspension) passent par
  `POST /admin/chat/messages/:messageId/sanctions` (`chat:moderate`) et sont tracées.
- Appliquer la politique de similarité Jaccard sans sanction automatique : une similarité élevée
  déclenche une **review humaine**, jamais une disqualification.
- Ne jamais afficher le contenu d'un signalement dans un canal public ni conserver de données
  supprimées dans un journal non anonymisé.

## 4. Rotation des secrets

| Secret | Effet de la rotation | Procédure |
|---|---|---|
| `SESSION_SECRET` | Invalide toutes les sessions | Prévenir les utilisateurs, régénérer, redémarrer l'API |
| `AES_KEY_BASE64` / `AES_KEY_ID` | Rend les anciens chiffrés illisibles | Suivre `runbook-aes-rotation.md` (ré-chiffrement obligatoire) |
| `ASSETS_SEED_KEY` | Invalide les URL signées d'assets | Regénérer puis republier les assets concernés |
| `LIVEKIT_API_SECRET` | Coupe les salons vocaux en cours | Coordonner avec une fenêtre de maintenance |

Les secrets sont stockés dans le gestionnaire de secrets de production ou `infra/secrets/*.txt`
en local ; jamais dans Git, jamais dans un log, jamais dans un ticket.

## 5. Portes de validation avant mise en production

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, E2E quatre
navigateurs, `pnpm test:a11y`, couverture métier ≥ 80 % et campagne de sécurité documentée.
Toute PR vers `main` demande une revue de `Moreau-Simon` ; deux approbations sont requises quand
`contracts/`, `prisma/schema.prisma` ou `migrations/` sont modifiés.
