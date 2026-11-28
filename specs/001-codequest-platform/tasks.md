---

description: "Task list for CodeQuest platform implementation"
---

# Tasks: Plateforme CodeQuest — défis informatiques et compétition

**Input**: Design documents from `/specs/001-codequest-platform/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [versioning.md](./versioning.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Inclus** — le principe IV de la constitution (`.specify/memory/constitution.md`) impose
l'écriture des tests avant la logique et des portes CI bloquantes. Chaque histoire démarre donc par ses
tests (qui doivent échouer), puis son implémentation.

**Organization**: Une phase par histoire utilisateur, dans l'ordre de priorité (P1 → P5), afin que
chaque tranche soit implémentable, testable et livrable indépendamment.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : peut s'exécuter en parallèle (fichiers différents, aucune dépendance en cours)
- **[Story]** : histoire de rattachement (`US1` … `US17`) ; absent en Setup, Foundational et Polish
- Chaque tâche porte un chemin de fichier exact

## Path Conventions

Monorepo défini dans [plan.md](./plan.md) § Project Structure :

- API : `apps/api/src/`, `apps/api/prisma/`, `apps/api/test/`
- Web : `apps/web/src/`, `apps/web/e2e/`
- Runner : `services/runner/src/`
- Assets : `services/assets/`
- Infra : `infra/`, `.github/workflows/`
- Racine : `CODEOWNERS`, `CHANGELOG.md`, `commitlint.config.cjs`, `.gitignore`, `README.md`

**Versionnage** : voir [versioning.md](./versioning.md) — monorepo unique, `main` protégée, branches
`feat/`/`fix/`, Conventional Commits, SemVer + tags, `challenge_versions` immuables, migrations
versionnées.

---

## Phase 0: Gouvernance du dépôt (à exécuter avant T001)

**Purpose**: Initialiser le dépôt et la protection de branche conformément à la section 11.2.

> Identifiants T279–T280 ajoutés après coup pour ne pas renuméroter les 278 tâches existantes ;
> leur exécution précède T001 malgré leur numérotation.

- [X] T279 Initialiser le dépôt git à la racine (`git init`, branche `main`, `.gitignore` couvrant `node_modules/`, `.env*`, `dist/`, `coverage/`, `*.log`, artefacts Prisma locaux) et poser le premier commit `chore: init monorepo`
- [X] T280 Configurer la protection de `main` et la revue : `CODEOWNERS`, `.github/pull_request_template.md`, checks CI requis (lint, typecheck, tests, E2E, accessibilité, sécurité), 1 approbation obligatoire (2 si `contracts/` ou `prisma/schema.prisma`), squash merge, suppression de la branche source
  - Note : artefacts versionnés et processus appliqués aux PR #21–#24 ; les réglages distants (`required_status_checks`, `require_code_owner_review`, `delete_branch_on_merge`) nécessitent les droits admin du propriétaire (`nairoddec` n’ayant que `push`/`triage`). Fusion effectuée en commit de merge conformément à la consigne explicite, malgré la mention « squash merge » de la tâche.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Squelette du monorepo, outillage et orchestration locale. Aucune logique métier.

- [X] T001 Créer l'espace de travail pnpm (`pnpm-workspace.yaml`, `package.json` racine, `turbo.json`) avec les paquets `apps/api`, `apps/web`, `services/runner`, `services/assets`
- [X] T002 [P] Ajouter `tsconfig.base.json` (Node 20, `strict`, `noUncheckedIndexedAccess`) et les `tsconfig.json` hérités de `apps/api`, `apps/web`, `services/runner`
- [X] T003 [P] Configurer ESLint + Prettier (`.eslintrc.cjs`, `.prettierrc`, `.editorconfig`) avec règles d'interdiction de `any` implicite et d'imports cross-module dans `apps/api/src/modules/**`
- [X] T004 [P] Ajouter Husky + lint-staged + **commitlint** (`.husky/pre-commit`, `.husky/commit-msg`, `commitlint.config.cjs` — Conventional Commits) + Gitleaks en pré-commit (`.husky/pre-commit`, `.gitleaks.toml`)
- [X] T005 [P] Écrire `.env.example` exhaustif (sans valeur réelle) et la validation d'environnement zod dans `apps/api/src/config/env.ts` avec échec au démarrage
- [X] T006 Écrire `infra/docker-compose.yml` : `postgres:16`, `redis:7`, `minio`, `mailhog`, `livekit`, `api`, `web`, `runner`, `assets`, avec healthchecks et réseaux segmentés
- [X] T007 [P] Initialiser Prisma dans `apps/api/prisma/schema.prisma` (datasource PostgreSQL, générateur `client`) et le script de migration
- [X] T008 [P] Configurer Vitest dans `apps/web/vitest.config.ts` et Jest dans `apps/api/jest.config.ts`
- [X] T009 [P] Configurer Playwright dans `apps/web/playwright.config.ts` (4 navigateurs, 3 viewports)
- [X] T010 [P] Initialiser `services/assets/pyproject.toml` (FastAPI, Pillow, qrcode, stegano, pytest) et `services/assets/app/main.py` minimal
- [X] T011 [P] Écrire `.github/workflows/ci.yml` : lint, typecheck, tests unitaires, intégration, build — statut bloquant
- [X] T012 [P] Échafauder `apps/web` : Vite + React 18 + TypeScript + Tailwind + React Router (`apps/web/src/main.tsx`, `apps/web/index.html`, `apps/web/tailwind.config.ts`)
- [X] T013 [P] Échafauder `apps/api` : `apps/api/src/main.ts` (helmet, cookies, préfixe `/api/v1`) et `apps/api/src/app.module.ts`
- [X] T014 [P] Échafauder `services/runner` : `services/runner/src/main.ts` (bootstrap du consommateur) et `services/runner/Dockerfile`
- [X] T015 [P] Ajouter `packages`-free génération de types client : script `apps/web/scripts/generate-api-types.mjs` consommant `contracts/openapi.yaml` vers `apps/web/src/services/api-types.ts`
- [X] T016 [P] Définir les jetons de design (couleurs, espacements, typographie, contrastes AA) dans `apps/web/tailwind.config.ts` et `apps/web/src/styles/tokens.css`
- [X] T017 [P] Initialiser l'i18n : `apps/web/src/i18n/fr.ts` et helper `t()` sans texte en dur dans les composants
- [X] T018 [P] Créer les `Dockerfile` de `apps/api`, `apps/web`, `services/assets` (utilisateur non-root, healthcheck)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Socle transverse (persistance, sécurité, temps réel, observabilité) requis par **toutes** les histoires.

**⚠️ CRITIQUE**: Aucune histoire ne démarre avant la fin de cette phase.

- [X] T019 Créer les modèles Prisma d'identité et de sécurité dans `apps/api/prisma/schema.prisma` : `User` (`email` citext UNIQUE, `pseudonym` citext UNIQUE 3–20 `[a-zA-Z0-9_-]`, `password_hash`, `email_verified_at`, `status`), `Session` (`refresh_token_hash` UNIQUE, `token_family_id`, `rotated_from`, `last_used_at`, `expires_at`, `revoked_at`), `PasswordResetToken` (`token_hash` UNIQUE, `expires_at`, `used_at`), `PushSubscription`
- [X] T020 Ajouter dans `apps/api/prisma/schema.prisma` le modèle RBAC : `Role` (`key` UNIQUE parmi `player|moderator|admin`), `Permission` (`key` UNIQUE `<domaine>:<action>`), `RolePermission`, `UserRole` (PK composite, `granted_by`), plus `AuditLog` (append-only) et `PlatformSetting` (`key` PK, `value` jsonb)
- [X] T021 Générer la migration initiale dans `apps/api/prisma/migrations/` et vérifier `prisma migrate deploy` sur une base vide
- [X] T022 [P] Implémenter `apps/api/src/common/uuid.ts` : générateur **UUIDv7** monotone (utilisé pour toutes les PK applicatives)
- [X] T023 [P] Implémenter `apps/api/src/common/crypto/aes-gcm.service.ts` : AES-256-GCM, nonce 12 octets, AAD = `challenge_version_id`, clé lue depuis l'environnement avec `key_id` versionné (FR-110)
- [X] T024 [P] Implémenter `apps/api/src/common/clock.ts` : horloge serveur UTC unique, source de vérité pour échéances d'event, rounds et régénération de PV
- [X] T025 [P] Créer `apps/api/src/prisma/prisma.service.ts` avec helper `runInTransaction()` et interception des erreurs de contrainte unique
- [X] T026 [P] Créer le filtre global d'exceptions `apps/api/src/common/filters/http-exception.filter.ts` produisant l'enveloppe `{ code, message, details }` du contrat OpenAPI
- [X] T027 [P] Configurer `pino` avec masquage de `password`, `token`, `email`, `authorization` dans `apps/api/src/common/logging/logger.ts` (FR-113)
- [X] T028 [P] Exposer les métriques Prometheus (`http_request_duration_seconds`, `queue_depth`, `realtime_connections`, `submission_verdict_seconds`) dans `apps/api/src/common/metrics/metrics.module.ts` sur `/metrics`
- [X] T029 [P] Implémenter le module de santé `apps/api/src/modules/health/health.controller.ts` (`/health` liveness, `/health/ready` avec PostgreSQL, Redis, MinIO)
- [X] T030 [P] Créer `apps/api/src/redis/redis.module.ts` (ioredis) avec préfixe de clés par environnement et client séparé pour BullMQ
- [X] T031 [P] Créer `apps/api/src/storage/storage.module.ts` : client MinIO, buckets `codequest-assets` et `codequest-secrets`, URLs signées 15 min
- [X] T032 [P] Créer `apps/api/src/queue/queue.module.ts` : files BullMQ `submissions`, `submissions-results`, `submissions-dlq`, avec `jobId = submissionId` et priorités du contrat `contracts/runner-job.md`
- [X] T033 Enregistrer la gateway Socket.IO `apps/api/src/realtime/realtime.gateway.ts` avec adaptateur Redis, authentification par cookie au handshake et fermeture des sockets à la révocation (FR-017)
- [X] T034 Créer le guard RBAC global `apps/api/src/modules/rbac/rbac.guard.ts` + décorateurs `@Public()` / `@RequirePermissions()` : refus par défaut de toute route sans permission déclarée (FR-019)
- [X] T035 Créer `apps/api/src/modules/audit/audit.service.ts` : écriture append-only, `actor_id`, `action`, `target_type`, `target_id`, `metadata`, `ip_prefix` (FR-089)
- [X] T036 [P] Créer `apps/api/src/mail/mail.service.ts` (Nodemailer, MailHog en dev, file d'attente des envois) avec gabarits de confirmation et de réinitialisation
- [X] T037 [P] Créer le module de limitation de débit `apps/api/src/common/rate-limit/rate-limit.guard.ts` adossé à Redis (fenêtre glissante, par compte et par préfixe IP)
- [X] T038 [P] Appliquer Helmet, CSP stricte, HSTS, `SameSite=Lax`, `HttpOnly`, `Secure` dans `apps/api/src/main.ts` (FR-108, FR-112)
- [X] T039 [P] Créer le middleware de corrélation `apps/api/src/common/middleware/request-context.middleware.ts` (`requestId`, utilisateur courant, préfixe IP /24 ou /48)
- [X] T040 [P] Écrire le seed des rôles et permissions dans `apps/api/prisma/seed/rbac.ts` (idempotent, aucune donnée personnelle)
- [X] T041 [P] Créer le harnais d'intégration Testcontainers dans `apps/api/test/helpers/db.ts` (PostgreSQL + Redis éphémères, migrations appliquées)
- [X] T042 [P] Créer le validateur de contrat OpenAPI dans `apps/api/test/helpers/contract.ts` (toutes les réponses conformes à `contracts/openapi.yaml`)
- [X] T043 [P] Créer la coquille web `apps/web/src/App.tsx` : layout, zone authentifiée, client TanStack Query, store Zustand de session
- [X] T044 [P] Créer les composants de base `apps/web/src/components/ui/` (Button, Input, Field, Modal, Toast, Skeleton) accessibles au clavier (FR-106)

**Checkpoint**: socle prêt — toutes les histoires peuvent démarrer en parallèle.

---

## Phase 3: User Story 1 - Créer un compte et gérer sa session en sécurité (Priority: P1) 🎯

**Goal**: Inscription, confirmation d'e-mail, connexion, sessions multiples révocables, réinitialisation,
suppression de compte avec anonymisation différée.

**Independent Test**: créer un compte, confirmer l'e-mail, se connecter depuis deux appareils, révoquer
une session, demander puis consommer un lien de réinitialisation, supprimer le compte — chaque étape
observable seule (interface + journal d'audit).

### Tests for User Story 1 ⚠️ (écrire d'abord, doivent échouer)

- [X] T045 [P] [US1] Tests de contrat des routes `/auth/*` et `/me` dans `apps/api/test/contract/auth.contract.spec.ts`
- [X] T046 [P] [US1] Tests d'intégration inscription/connexion/rotation dans `apps/api/test/integration/auth.spec.ts` (pseudo en double → `409`, mot de passe < 12 → `400`, 5 échecs → `423`)
- [X] T047 [P] [US1] Tests d'intégration réutilisation de refresh token dans `apps/api/test/integration/session-reuse.spec.ts` (réutilisation ⇒ révocation de toute la famille)
- [X] T048 [P] [US1] E2E Playwright du parcours inscription → confirmation → connexion → révocation dans `apps/web/e2e/auth.spec.ts`

### Implementation for User Story 1

- [X] T049 [P] [US1] Implémenter `apps/api/src/modules/auth/dto/register.dto.ts` : `email` format RFC 5322, `pseudonym` 3–20 `^[a-zA-Z0-9_-]+$`, `password` ≥ 12 caractères
- [X] T050 [P] [US1] Implémenter `apps/api/src/modules/auth/password.service.ts` : Argon2id (19 MiB, 2 itérations, parallélisme 1) et vérification contre la liste des mots de passe compromis (FR-002, FR-109)
- [X] T051 [US1] Implémenter `apps/api/src/modules/auth/auth.service.ts` : inscription, unicité e-mail/pseudo, envoi du lien de confirmation, compte `pending` en lecture seule publique (FR-001, FR-003)
- [X] T052 [US1] Implémenter `apps/api/src/modules/auth/session.service.ts` : JWT 15 min, refresh opaque 256 bits haché SHA-256, rotation, détection de réutilisation, expiration glissante 7 j / plafond 30 j (FR-011)
- [X] T053 [US1] Implémenter `apps/api/src/modules/auth/auth.controller.ts` : `POST /auth/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`, `/verify-email` conformes à `contracts/openapi.yaml`
- [X] T054 [US1] Implémenter le verrouillage progressif après 5 échecs dans `apps/api/src/modules/auth/lockout.service.ts` avec réponse `423` (FR-006)
- [X] T055 [US1] Implémenter la réinitialisation par lien à usage unique valable 1 h dans `apps/api/src/modules/auth/password-reset.service.ts`, réponse identique pour adresse inconnue (FR-007)
- [X] T056 [US1] Révoquer toutes les sessions après changement de mot de passe dans `apps/api/src/modules/auth/session.service.ts` (FR-008)
- [X] T057 [US1] Implémenter `apps/api/src/modules/users/me.controller.ts` : `GET/PATCH/DELETE /me`, `GET /me/export`, `GET/DELETE /me/sessions`, `DELETE /me/sessions/{id}` (FR-009, FR-010, FR-015, FR-016)
- [X] T058 [US1] Implémenter la suppression logique dans `apps/api/src/modules/users/account-deletion.service.ts` : réauthentification ≤ 15 min, `deleted_at`, révocation des sessions, purge planifiée à J+30, anonymisation immédiate des scores et messages en « Joueur supprimé » (FR-012, FR-013, FR-115)
- [X] T059 [US1] Implémenter la purge J+30 `apps/api/src/modules/users/purge.job.ts` (BullMQ répétable) libérant pseudo et e-mail (SC-017)
- [X] T060 [US1] Ajouter l'authentification par cookie au guard `apps/api/src/modules/auth/jwt.strategy.ts` et fermer les sockets à la révocation via `realtime.gateway.ts` (FR-017)
- [X] T061 [P] [US1] Créer les pages `apps/web/src/pages/auth/RegisterPage.tsx`, `LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `VerifyEmailPage.tsx`
- [X] T062 [P] [US1] Créer `apps/web/src/pages/settings/SessionsPage.tsx` (appareil, date, préfixe IP, révocation unitaire et globale)
- [X] T063 [P] [US1] Créer `apps/web/src/pages/settings/ProfilePage.tsx` (pseudo, avatar, langue d'exécution, préférences) et `DeleteAccountDialog.tsx` (confirmation par mot de passe)
- [X] T064 [US1] Ajouter les entrées d'audit pour inscription, connexion échouée, changement de mot de passe, révocation et suppression dans `apps/api/src/modules/auth/audit.events.ts`
- [X] T065 [US1] Ajouter la limitation de débit dédiée à `/auth/login`, `/auth/forgot-password` et `/auth/register` dans `apps/api/src/modules/auth/auth.rate-limit.ts`
- [X] T066 [US1] Vérifier `quickstart.md` § S1 et S11 (compte non confirmé en lecture seule, anonymisation des scores)

**Checkpoint**: US1 fonctionnelle et testable seule — socle d'identité disponible pour toutes les autres.

---

## Phase 4: User Story 2 - Résoudre un défi de tri et obtenir un score équitable (Priority: P1)

**Goal**: Catalogue minimal, éditeur, soumission exécutée dans le bac à sable, mesure du temps CPU,
verdict temps réel, meilleur score conservé.

**Independent Test**: publier un défi de tri (tests visibles + cachés), soumettre une solution correcte
lente, une correcte optimale et une incorrecte → faible bonus, bonus maximal, échec sans score.

### Tests for User Story 2 ⚠️

- [X] T067 [P] [US2] Tests de contrat `/challenges/{id}/submissions` et `/submissions/{id}` dans `apps/api/test/contract/submissions.contract.spec.ts`
- [X] T068 [P] [US2] Tests unitaires de la formule de score dans `apps/api/test/unit/scoring.spec.ts` (bornes `0 ≤ score ≤ base_points + perf_max`, tolérance ±5 %)
- [X] T069 [P] [US2] Tests golden de non-régression dans `apps/api/test/golden/sorting.spec.ts` (correct lent / optimal / incorrect → scores figés)
- [X] T070 [P] [US2] Tests d'évasion du bac à sable dans `services/runner/test/escape.test.ts` (réseau, `/etc/shadow`, bombe de fork, allocation mémoire) — SC-008
- [X] T071 [P] [US2] Tests d'idempotence de job dans `services/runner/test/idempotency.test.ts` (même `jobId` livré deux fois ⇒ une seule exécution)

### Implementation for User Story 2

- [X] T072 [P] [US2] Créer les modèles Prisma `Challenge` (`difficulty` CHECK 1..5, `languages` sous-ensemble `{python,javascript}`, `base_points ≥ 0`, `perf_max ≥ 0`, `0 < t_opt_ms < t_max_ms`, `status`) et `ChallengeVersion` (`tests_encrypted`, `reference_solution_encrypted`, `key_id`, UNIQUE `(challenge_id, version)`) dans `apps/api/prisma/schema.prisma`
- [X] T073 [P] [US2] Créer les modèles Prisma `Submission` (`cpu_times_ms` 5 valeurs, `cpu_time_median_ms`, `tests_passed ≤ tests_total`, `score numeric(12,2)`, `is_official`) et `BestScore` (UNIQUE `(challenge_id, subject_type, subject_id)`) dans `apps/api/prisma/schema.prisma`
- [X] T074 [US2] Migrer et indexer `apps/api/prisma/migrations/` : `(challenge_id, score DESC, created_at ASC)`, `(user_id, created_at DESC)`
- [X] T075 [P] [US2] Implémenter `apps/api/src/modules/scoring/scoring.service.ts` — **source unique du calcul** : `score = base_points * (tests_passed / tests_total) + perf_max * clamp((t_max - t_median) / (t_max - t_opt), 0, 1)`, arrondi et bornes `0 ≤ score ≤ base_points + perf_max` (FR-030, FR-032)
- [X] T076 [US2] Implémenter `apps/api/src/modules/submissions/submissions.service.ts` : création en `pending`, enqueue BullMQ idempotent, transition `running`, conservation du meilleur score (FR-033, FR-035)
- [X] T077 [US2] Implémenter `apps/api/src/modules/submissions/submissions.controller.ts` : `POST /challenges/{id}/submissions` (`202`) et `GET /submissions/{id}` (repli temps réel)
- [X] T078 [US2] Implémenter `apps/api/src/modules/submissions/verdict.consumer.ts` : lecture de `submissions-results`, mise à jour transactionnelle (submission + best_score), émission `submission.verdict` (FR-034)
- [X] T079 [US2] Implémenter la diffusion `submission.queued` / `submission.started` / `submission.verdict` dans `apps/api/src/realtime/submissions.gateway.ts` selon `contracts/websocket-events.md`
- [X] T080 [US2] Implémenter `services/runner/src/queue/consumer.ts` : consommation BullMQ, `attempts=1`, acquittement des doublons, requeue des seules erreurs d'infrastructure (contrat §6)
- [X] T081 [US2] Implémenter `services/runner/src/sandbox/sandbox.ts` : conteneur gVisor éphémère (`--network=none`, `--read-only`, `--cap-drop=ALL`, UID 10001, `tmpfs` 64 Mio, seccomp `infra/seccomp/runner.json`)
- [X] T082 [P] [US2] Créer le profil seccomp `infra/seccomp/runner.json` et les images `services/runner/runtimes/python.Dockerfile` / `node.Dockerfile` épinglées par digest
- [X] T083 [US2] Implémenter `services/runner/src/measure/cpu.ts` : delta de `cpu.stat → usage_usec` avant/après, 5 runs, médiane, écart-type, run de confirmation si écart > 20 % (plafond 7)
- [X] T084 [US2] Implémenter le déchiffrement des tests côté runner `services/runner/src/sandbox/tests-loader.ts` (AES-256-GCM, AAD = version, jamais transmis au navigateur) (FR-028, FR-110)
- [X] T085 [US2] Implémenter la détection d'abus dans `services/runner/src/measure/abuse.ts` : violations seccomp, tentatives réseau, binaires interdits, sortie hors bornes → `status = rejected` + audit (FR-036)
- [X] T086 [US2] Implémenter le timeout dur et les limites cgroups (`wallTimeMs`, `cpuTimeMs`, `memoryMb`, `pidsMax`) dans `services/runner/src/measure/limits.ts` (FR-027)
- [X] T087 [P] [US2] Créer l'éditeur `apps/web/src/components/editor/CodeEditor.tsx` (Monaco, coloration Python/JavaScript, thème, plein écran)
- [X] T088 [P] [US2] Créer `apps/web/src/pages/challenges/ChallengePage.tsx` (énoncé Markdown, éditeur, bouton Soumettre, panneau de verdict, raison d'échec filtrée)
- [X] T089 [P] [US2] Créer le hook `apps/web/src/hooks/useSubmissionVerdict.ts` : socket + repli par interrogation toutes les 2 s
- [X] T090 [US2] Vérifier `quickstart.md` § S2 et S3 (verdict < 10 s, ±5 %, non-fuite des tests cachés)

**Checkpoint**: US2 livrable seule — boucle de valeur centrale opérationnelle.

---

## Phase 5: User Story 3 - Consulter les classements (Priority: P1)

**Goal**: Classements global, par thématique, saison, event et équipe ; filtres de période ; départage
par soumission la plus ancienne ; reconstruction cohérente.

**Independent Test**: trois joueurs à scores distincts → ordre correct ; deux scores égaux → le plus
ancien devant ; filtres thématique + période ; reconstruction identique au temps réel.

### Tests for User Story 3 ⚠️

- [X] T091 [P] [US3] Tests d'intégration du classement dans `apps/api/test/integration/leaderboard.spec.ts` (ordre, départage, filtres)
- [X] T092 [P] [US3] Test de reconstruction dans `apps/api/test/integration/leaderboard-rebuild.spec.ts` (ZSET temps réel == reconstruction PostgreSQL)
- [X] T093 [P] [US3] Tests de contrat `/leaderboards/*` dans `apps/api/test/contract/leaderboards.contract.spec.ts`

### Implementation for User Story 3

- [X] T094 [P] [US3] Créer les modèles Prisma `Season` et `LeaderboardEntry` (UNIQUE `(scope_type, scope_id, subject_type, subject_id)`) dans `apps/api/prisma/schema.prisma`
- [X] T095 [US3] Implémenter `apps/api/src/modules/leaderboards/leaderboard.service.ts` : écriture ZSET `score * 10^6 + (MAX_TS - submission_ts)` par portée `global|theme|season|event|team` après commit PostgreSQL
- [X] T096 [US3] Implémenter `apps/api/src/modules/leaderboards/leaderboard.controller.ts` : `/leaderboards/players`, `/teams`, `/events/{eventId}` avec `scope`, `scopeId`, `period`, curseur
- [X] T097 [US3] Implémenter les filtres de période (`week`, `month`, `season`, `all`) dans `apps/api/src/modules/leaderboards/period.filter.ts` (FR-047)
- [X] T098 [US3] Implémenter le job de reconstruction `apps/api/src/modules/leaderboards/rebuild.job.ts` depuis `best_scores`, avec vérification d'identité des classements (SC-009)
- [X] T099 [US3] Émettre `leaderboard.updated` en incrémental depuis `apps/api/src/realtime/leaderboard.gateway.ts` et exposer l'abonnement client (FR-049)
- [X] T100 [P] [US3] Créer `apps/web/src/pages/leaderboards/LeaderboardPage.tsx` (onglets joueurs/équipes/events, filtres, position personnelle, rafraîchissement temps réel)

**Checkpoint**: US3 livrable seule — compétition visible.

---

## Phase 6: User Story 4 - Administrer le contenu et les utilisateurs (Priority: P1)

**Goal**: Back-office : CRUD défis, validation par solution de référence, versionnement, gestion des
rôles et suspensions, journal d'audit, traitement des signalements.

**Independent Test**: plateforme vierge → créer un défi avec solution de référence, le valider, le
publier, le jouer, modifier l'énoncé (nouvelle version), vérifier les entrées d'audit.

### Tests for User Story 4 ⚠️

- [X] T101 [P] [US4] Tests d'intégration de la validation de défi dans `apps/api/test/integration/challenge-validation.spec.ts` (test fautif → publication bloquée, `422`)
- [X] T102 [P] [US4] Tests RBAC refus par défaut dans `apps/api/test/integration/rbac.spec.ts` (modérateur → route admin = `403`, auto-attribution de rôle interdite)
- [X] T103 [P] [US4] Tests d'immuabilité de l'audit dans `apps/api/test/integration/audit-immutability.spec.ts` (`UPDATE`/`DELETE` → exception)

### Implementation for User Story 4

- [X] T104 [US4] Implémenter `apps/api/src/modules/admin/challenges.admin.service.ts` : brouillon, édition, versionnement immuable après publication (FR-084, FR-087)
- [X] T105 [US4] Implémenter la validation `apps/api/src/modules/admin/challenge-validation.service.ts` : exécution de la solution de référence via le runner, vérification des 100 % de tests, calibrage `t_opt_ms`/`t_max_ms`, blocage avec test fautif identifié (FR-085, FR-086, FR-029)
- [X] T106 [US4] Implémenter `apps/api/src/modules/admin/challenges.admin.controller.ts` : `POST /admin/challenges`, `/admin/challenges/{id}/validate`, plus les routes de mise à jour et d'archivage
- [X] T107 [US4] Implémenter `apps/api/src/modules/rbac/role.service.ts` : attribution et retrait de rôles, cumul, interdiction d'auto-attribution (FR-018, FR-020)
- [X] T108 [US4] Implémenter `apps/api/src/modules/admin/users.admin.controller.ts` : `GET /admin/users`, suspension, réactivation, suppression administrative, changement de rôle (FR-088)
- [X] T109 [US4] Implémenter les contraintes de modération dans `apps/api/src/modules/admin/moderation.policy.ts` : un modérateur ne peut sanctionner un administrateur ni un pair (FR-090)
- [X] T110 [US4] Implémenter `apps/api/src/modules/admin/audit.controller.ts` : `GET /admin/audit-logs` avec filtres `actorId`, cible et plage de dates (FR-089)
- [X] T111 [US4] Implémenter le traitement des signalements `apps/api/src/modules/chat/reports.service.ts` (statuts `open → reviewed | dismissed`, notification du joueur sanctionné) (FR-094)
- [X] T112 [US4] Implémenter `apps/api/src/modules/admin/stats.controller.ts` : utilisateurs actifs, défis les plus joués, taux de réussite, profondeur de file (FR-050, FR-083)
- [X] T113 [P] [US4] Créer `apps/web/src/pages/admin/ChallengeEditorPage.tsx` (énoncé Markdown, tests visibles/cachés, solution de référence, bouton Valider, diagnostic)
- [X] T114 [P] [US4] Créer `apps/web/src/pages/admin/AdminDashboardPage.tsx` (statistiques, file d'exécution, alertes)
- [X] T115 [P] [US4] Créer `apps/web/src/pages/admin/UsersAdminPage.tsx` (recherche, rôles, suspension) et `AuditLogPage.tsx` (lecture seule, filtres)
- [X] T116 [US4] Relier chaque action administrative à une entrée d'audit non modifiable (`audit.service.ts`) et vérifier `quickstart.md` § S10 (modération)

**Checkpoint**: US4 livrable seule — contenu publiable, rôles maîtrisés.

---

## Phase 7: User Story 5 - Explorer les défis par thématique et prérequis (Priority: P1)

**Goal**: Catalogue filtrable, prérequis en graphe acyclique, motif de verrouillage explicite,
déblocage automatique.

**Independent Test**: deux défis dont le second exige le premier → second verrouillé avec motif, puis
débloqué après réussite ; cycle A↔B refusé à l'enregistrement.

### Tests for User Story 5 ⚠️

- [X] T117 [P] [US5] Tests unitaires du graphe de prérequis dans `apps/api/test/unit/prerequisites.spec.ts` (cycle → refus, quatre types de conditions, exclusivité)
- [X] T118 [P] [US5] Tests d'intégration du déblocage dans `apps/api/test/integration/unlock.spec.ts` (niveau, cours, chapitre de lore, défi réussi)
- [X] T119 [P] [US5] Tests de contrat `/challenges` et `/challenges/{id}` dans `apps/api/test/contract/challenges.contract.spec.ts`

### Implementation for User Story 5

- [X] T120 [P] [US5] Créer les modèles Prisma `Theme` (`slug` UNIQUE) et `ChallengePrerequisite` (exactement une des quatre conditions renseignée, CHECK en base) dans `apps/api/prisma/schema.prisma`
- [X] T121 [US5] Implémenter la détection de cycle par parcours en profondeur dans `apps/api/src/modules/challenges/prerequisite-graph.service.ts` (FR-024)
- [X] T122 [US5] Implémenter `apps/api/src/modules/challenges/challenges.service.ts` : catalogue filtré par thème, difficulté, type, statut, avec `status ∈ {locked, available, completed}` (FR-021, FR-022)
- [X] T123 [US5] Implémenter l'évaluation des prérequis dans `apps/api/src/modules/challenges/prerequisite-check.service.ts` et le retour de `missingPrerequisites` nommés (FR-023, FR-025)
- [X] T124 [US5] Implémenter `apps/api/src/modules/challenges/challenges.controller.ts` : `GET /challenges`, `GET /challenges/{id}` avec `403` motivé si verrouillé
- [X] T125 [US5] Implémenter la déclaration des langages supportés par défi (`text[]` sous-ensemble de `{python, javascript}`, au moins deux langages possibles) (FR-026)
- [X] T126 [US5] Ajouter les entrées d'audit de création/modification des prérequis et thématiques dans `apps/api/src/modules/challenges/audit.events.ts`
- [X] T127 [P] [US5] Créer `apps/web/src/pages/challenges/CatalogPage.tsx` (filtres, tri, badges de difficulté, état verrouillé avec motif au survol)
- [X] T128 [US5] Vérifier `quickstart.md` § S5 (prérequis affichés) et l'absence de contenu en dur (i18n)

**Checkpoint**: US5 livrable seule — parcours guidé fonctionnel.

---

## Phase 8: User Story 6 - Suivre un cours et progresser dans un parcours (Priority: P2)

**Goal**: Leçons courtes, mini-quiz, défi d'application, XP et niveaux.

**Independent Test**: suivre une leçon, échouer puis réussir le quiz, constater la progression
et le déblocage du défi d'application.

### Tests for User Story 6 ⚠️

- [X] T129 [P] [US6] Tests unitaires de la courbe d'XP dans `apps/api/test/unit/xp.spec.ts` (monotonie, paliers, aucun niveau négatif)
- [X] T130 [P] [US6] Tests d'intégration progression et mini-quiz dans `apps/api/test/integration/lessons.spec.ts`
- [X] T131 [P] [US6] Tests de contrat `/lessons` dans `apps/api/test/contract/lessons.contract.spec.ts`

### Implementation for User Story 6

- [X] T132 [P] [US6] Créer les modèles Prisma `Lesson` (`slug` UNIQUE, `content_md`, `order`, `quiz` jsonb) et `LessonProgress` (PK composite, `status ∈ {not_started, in_progress, completed}`) dans `apps/api/prisma/schema.prisma`
- [X] T133 [US6] Implémenter `apps/api/src/modules/lessons/lessons.service.ts` : contenu, quiz, persistance de la progression et de l'état de lecture (FR-051, FR-053)
- [X] T134 [US6] ~~Retiré~~ : le test de positionnement (FR-052) est supprimé au profit du seul mini-quiz pédagogique.
- [X] T135 [US6] Implémenter `apps/api/src/modules/lessons/xp.service.ts` : attribution d'XP par défi réussi, recalcul du niveau, courbe paramétrable dans `PlatformSetting` (FR-054)
- [X] T136 [US6] Exposer `apps/api/src/modules/lessons/lessons.controller.ts` : `GET /lessons`, `POST /lessons/{id}/complete`
- [X] T137 [P] [US6] Créer `apps/web/src/pages/lessons/LessonPage.tsx` (Markdown, quiz, progression, défi d'application lié) et `LessonsPage.tsx` (parcours)
- [X] T138 [US6] Instrumenter le suivi analytique du taux de réussite au premier essai dans `apps/api/src/modules/lessons/analytics.service.ts` (SC-010)

**Checkpoint**: US6 livrable seule.

---

## Phase 9: User Story 7 - Résoudre des défis de débogage et de décryptage (Priority: P2)

**Goal**: Défis de débogage (bugs cachés, lignes modifiées) et de décryptage notés au temps de
résolution, instances générées par graine.

**Independent Test**: soumettre un correctif ciblé → score selon temps de résolution et nombre de
lignes modifiées ; soumettre un code identique à l'original → échec.

### Tests for User Story 7 ⚠️

- [X] T139 [P] [US7] Tests unitaires du score de débogage/décryptage dans `apps/api/test/unit/debug-scoring.spec.ts` (temps de résolution, pénalité de lignes modifiées) — A5 tranchée le 19 nov. 2026
- [X] T140 [P] [US7] Tests d'intégration d'un défi de débogage de bout en bout dans `apps/api/test/integration/debugging.spec.ts`
- [X] T141 [P] [US7] Tests de déterminisme des instances générées dans `services/assets/tests/test_determinism.py`

### Implementation for User Story 7

- [X] T142 [US7] Ajouter les champs de débogage (`buggy_code`, `modified_lines`) et de décryptage (`cipher`, `key_seed_ref`) aux modèles de défi dans `apps/api/prisma/schema.prisma` (FR-037) — migration `20261119150000_us7_debugging_decryption` + modèle `ChallengeAttempt` (une seule tentative en v1)
- [X] T143 [US7] Implémenter le comptage de lignes modifiées dans `apps/api/src/modules/submissions/diff.service.ts` (diff normalisé indépendant du style) (FR-038)
- [X] T144 [US7] Implémenter `apps/api/src/modules/scoring/resolution-scoring.service.ts` : score fondé sur le temps de résolution, plafonné, avec pénalité de lignes (FR-039)
- [X] T145 [US7] Implémenter la génération d'instance de décryptage par graine dans `apps/api/src/modules/challenges/instance.service.ts` (appel au service d'assets, seed HMAC) (FR-040)
- [X] T146 [US7] Exposer le bloc de code bogué dans `GET /challenges/{id}` sans révéler les bugs ni la solution (FR-028)
- [X] T147 [P] [US7] Créer `apps/web/src/pages/challenges/DebugChallengePage.tsx` (éditeur préchargé, surlignage des lignes modifiées, compteur de modifications) — route `/challenges/:id/debug`, `debug-diff.ts` et 5 tests Vitest
- [X] T148 [US7] Vérifier `quickstart.md` § S2 (variante débogage) et l'absence de fuite de solution — variantes A/B documentées, contrôle graine/tests cachés (SC-007 + `debugging.spec.ts` + `test_determinism.py`)

**Checkpoint**: US7 livrable seule.

---

## Phase 10: User Story 8 - Former une équipe et coder à plusieurs en temps réel (Priority: P2)

**Goal**: Équipes 2–5, capitaine, invitations, édition collaborative Yjs, soumission officielle unique,
score de contribution individuelle, conservation des acquis au départ.

**Independent Test**: créer une équipe, inviter, éditer à deux sans conflit, désigner une soumission
officielle, changer la désignation, vérifier qu'aucune agrégation n'a lieu.

### Tests for User Story 8 ⚠️

- [X] T149 [P] [US8] Tests d'intégration équipes dans `apps/api/test/integration/teams.spec.ts` (taille 2–5, un seul engagement actif, transfert de capitainerie)
- [X] T150 [P] [US8] Tests de la soumission officielle dans `apps/api/test/integration/official-submission.spec.ts` (dernier désigné gagne, pas d'agrégation, seul le capitaine, **classement d'équipe mis à jour après désignation et après remplacement**) (FR-046, SC-009)
- [X] T151 [P] [US8] Tests de convergence Yjs dans `apps/api/test/integration/yjs.spec.ts` (deux clients, délta concurrents, état persisté)
- [X] T152 [P] [US8] E2E Playwright édition collaborative dans `apps/web/e2e/team-collab.spec.ts`

### Implementation for User Story 8

- [X] T153 [P] [US8] Créer les modèles Prisma `Team` (`name` UNIQUE 3–40, `tag` UNIQUE 2–6, `captain_id`), `TeamMember` (index partiel UNIQUE `user_id WHERE left_at IS NULL`, `role ∈ {captain, member}`), `TeamInvitation` (`token_hash` UNIQUE) dans `apps/api/prisma/schema.prisma`
- [X] T154 [P] [US8] Créer le modèle `TeamOfficialSubmission` (UNIQUE `(team_id, challenge_id)`, `designated_by`) dans `apps/api/prisma/schema.prisma`
- [X] T155 [US8] Implémenter `apps/api/src/modules/teams/teams.service.ts` : création, invitations, adhésion, départ, exclusion, taille configurable 2–5 (FR-055, FR-056)
- [X] T156 [US8] Implémenter le transfert automatique de capitainerie à la suppression du capitaine dans `apps/api/src/modules/teams/captaincy.service.ts` (FR-014)
- [X] T157 [US8] Implémenter `apps/api/src/modules/teams/official-submission.service.ts` : désignation par le capitaine uniquement, remplacement du précédent, unicité en base ; **recalcul transactionnel de `best_scores(subject_type = team)` et mise à jour du ZSET `team:<id>` dans la même transaction** (FR-046, FR-058, FR-049) — voir la note D4/ZSET dans `avancement.md` : ZSET mis à jour après commit, comme `recordRetainedScore`, la reconstruction périodique garantissant SC-009
- [X] T158 [US8] Implémenter la conservation des scores acquis au départ d'un membre dans `apps/api/src/modules/teams/membership.service.ts` (FR-060)
- [X] T159 [US8] Implémenter le score de contribution individuelle (lignes conservées, réussites, participations) dans `apps/api/src/modules/teams/contribution.service.ts` (FR-059)
- [X] T160 [US8] Implémenter le serveur Yjs `apps/api/src/realtime/yjs.provider.ts` (document `team_id:challenge_id`, persistance périodique, compaction, awareness des curseurs) (FR-057)
- [X] T161 [P] [US8] Créer `apps/web/src/pages/teams/TeamPage.tsx` (membres, invitations, capitaine, contribution, soumission officielle) et `TeamSettingsPage.tsx`
- [X] T162 [US8] Intégrer Yjs dans `apps/web/src/hooks/useCollaborativeDoc.ts` et l'éditeur Monaco (curseurs distants, présence)

**Checkpoint**: US8 livrable seule — collaboration opérationnelle.

---

## Phase 11: User Story 9 - Participer à un événement à essai unique (Priority: P2)

**Goal**: Fenêtre explicite avec fuseau IANA, essai unique consommé au démarrage explicite, classement
dédié, publication des résultats et déblocage des solutions à la clôture.

**Independent Test**: s'inscrire sans démarrer (aucun chrono), démarrer (409 au second appel), soumettre
après clôture (refus), consulter le classement dédié puis les solutions après clôture.

### Tests for User Story 9 ⚠️

- [X] T163 [P] [US9] Tests d'intégration event à essai unique dans `apps/api/test/integration/event-attempt.spec.ts` (non-consommation à l'ouverture, consommation explicite, `409`, **abandon ou fermeture du navigateur ⇒ essai consommé après expiration**) (FR-062)
- [X] T164 [P] [US9] Tests de frontière temporelle dans `apps/api/test/integration/event-boundary.spec.ts` (soumission à `ends_at`, fuseau IANA, heure d'été)
- [X] T165 [P] [US9] Tests de contrat `/events/*` dans `apps/api/test/contract/events.contract.spec.ts`

### Implementation for User Story 9

- [X] T166 [P] [US9] Créer les modèles Prisma `Event` (`timezone` IANA validé, CHECK `ends_at > starts_at`, `type ∈ {standard, battle_royale}`, CHECK `max_attempts = 1`), `EventChallenge`, `EventParticipant` (UNIQUE `(event_id, subject_type, subject_id)`) dans `apps/api/prisma/schema.prisma`
- [X] T167 [US9] Implémenter `apps/api/src/modules/events/events.service.ts` : inscription, fenêtre d'ouverture calculée sur l'horloge serveur, refus hors fenêtre (FR-061)
- [X] T168 [US9] Implémenter `apps/api/src/modules/events/attempt.service.ts` : démarrage explicite, `attempt_started_at`, `attempt_consumed_at`, un seul essai, `409` sinon ; considérer l'abandon ou la fermeture du navigateur comme consommé via un job d'expiration `apps/api/src/modules/events/attempt-expiry.job.ts` (échéance = `starts_at` + durée de la fenêtre) (FR-062, FR-065)
- [X] T169 [US9] Implémenter `apps/api/src/modules/events/results.service.ts` : classement dédié, récompenses, publication à la clôture, déblocage des solutions après clôture (FR-063, FR-064)
- [X] T170 [US9] Implémenter les routes `apps/api/src/modules/events/events.controller.ts` : `GET /events`, `POST /events/{id}/join`, `POST /events/{id}/start`
- [X] T171 [US9] Ajouter la priorité de file `1` aux soumissions d'event dans `apps/api/src/modules/submissions/priority.ts` (contrat runner §6) — priorité déjà présente dans `apps/api/src/queue/queue.priorities.ts` (`event: 1`) et désormais utilisée par `SubmissionsService.create()`.
- [X] T172 [P] [US9] Créer `apps/web/src/pages/events/EventsPage.tsx` (liste, fuseau affiché, compte à rebours) et `EventDetailPage.tsx` (bouton Démarrer l'essai avec confirmation explicite, chrono serveur)
- [X] T173 [P] [US9] Créer `apps/web/src/pages/events/EventLeaderboardPage.tsx` (classement dédié, résultats après clôture, solutions débloquées)
- [X] T174 [US9] Vérifier `quickstart.md` § S6 et l'absence de pause lors d'une déconnexion

**Checkpoint**: US9 livrable seule.

---

## Phase 12: User Story 10 - Affronter un boss et gérer ses points de vie (Priority: P3)

**Goal**: Boss en phases, 100 PV, dégâts proportionnels au score, KO 30 min, régénération passive,
pool partagé en équipe, victoire unique.

**Independent Test**: échouer une phase (PV baissent), tomber à 0 (KO, boss bloqué), utiliser une
potion (PV restaurés), vaincre le boss (une seule fois).

### Tests for User Story 10 ⚠️

- [x] T175 [P] [US10] Tests unitaires des PV dans `apps/api/test/unit/health.spec.ts` (bornes 0..100, régénération 1 PV/6 min, plafond, pas de régénération pendant KO)
- [x] T176 [P] [US10] Tests d'intégration boss dans `apps/api/test/integration/boss.spec.ts` (phases ordonnées, dégâts, victoire unique, blocage en KO)

### Implementation for User Story 10

- [x] T177 [P] [US10] Créer les modèles Prisma `Boss`, `BossPhase` (`hp_share` somme = 100, UNIQUE `(boss_id, order)`), `PlayerHealth` (UNIQUE `(subject_type, subject_id)`, CHECK `0 ≤ hp ≤ max_hp`), `BossEngagement` (UNIQUE `(boss_id, subject_type, subject_id)`) dans `apps/api/prisma/schema.prisma`
- [x] T178 [US10] Implémenter `apps/api/src/modules/bosses/health.service.ts` : régénération calculée à la lecture puis matérialisée, KO à `ko_until`, restauration par potion (FR-067, FR-069)
- [x] T179 [US10] Implémenter `apps/api/src/modules/bosses/boss.service.ts` : phases ordonnées, progression, dégâts `per_100_score`, victoire unique (FR-066, FR-070)
- [x] T180 [US10] Implémenter le blocage en KO dans `apps/api/src/modules/bosses/boss.guard.ts` avec motif et échéance affichés (FR-068)
- [x] T181 [US10] Implémenter le pool de PV partagé d'équipe dans `apps/api/src/modules/bosses/team-health.service.ts` (FR-071)
- [x] T182 [US10] Exposer `apps/api/src/modules/bosses/bosses.controller.ts` : `GET /bosses`, `POST /bosses/{id}/phases/{phaseId}/submissions`, `GET /me/health`
- [x] T183 [US10] Émettre `health.changed`, `health.ko`, `health.restored`, `boss.phase.cleared`, `boss.defeated` (contrat temps réel §3.3)
- [x] T184 [P] [US10] Créer `apps/web/src/pages/bosses/BossPage.tsx` (barre de PV animée mais désactivable, phases, compte à rebours de KO) et `HealthBar.tsx`

**Checkpoint**: US10 livrable seule.

---

## Phase 13: User Story 11 - Gagner et dépenser des Bits (Priority: P3)

**Goal**: Monnaie non convertible, registre immuable idempotent, boutique, indices progressifs achetables
(exploratoires, solo), potions, badges.

**Independent Test**: acheter un indice sur un défi exploratoire (débit unique), tenter un achat interdit
(sorting / event / boss → `409`), rejouer la requête (aucun second débit), vérifier
`SUM(transactions) = balance`.

### Tests for User Story 11 ⚠️

- [x] T185 [P] [US11] Tests unitaires du registre dans `apps/api/test/unit/ledger.spec.ts` (`balance = SUM(amount)`, montants signés, idempotence)
- [x] T186 [P] [US11] Tests d'intégration achats dans `apps/api/test/integration/shop.spec.ts` (solde insuffisant → `402`, achat interdit → `409`, double envoi → un seul débit)
- [x] T187 [P] [US11] Tests des règles d'indices dans `apps/api/test/integration/hints.spec.ts` (sorting interdit, event ouvert interdit, boss interdit, ne révèle jamais tests/solution)

### Implementation for User Story 11

- [x] T188 [P] [US11] Créer les modèles Prisma `Wallet` (`balance ≥ 0`, `user_id` UNIQUE), `Transaction` (`amount` signé, `idempotency_key` UNIQUE, `balance_after`, `reason` enum), `ShopItem`, `Inventory` (UNIQUE `(user_id, shop_item_id)`), `ChallengeHint`, `HintPurchase` (UNIQUE `(user_id, hint_id)`), `Badge`, `UserBadge` dans `apps/api/prisma/schema.prisma`
- [x] T189 [US11] Créer le trigger d'immuabilité du registre dans `apps/api/prisma/migrations/` (`BEFORE UPDATE/DELETE` → exception) (FR-073)
- [x] T190 [US11] Implémenter `apps/api/src/modules/economy/ledger.service.ts` : écriture append-only, clé d'idempotence, mise à jour du solde dans la même transaction, contrôle de cohérence (SC-021)
- [x] T191 [US11] Implémenter `apps/api/src/modules/economy/rewards.service.ts` : Bits pour défis, records, events, boss, badges, séries (FR-072)
- [x] T192 [US11] Implémenter `apps/api/src/modules/economy/shop.service.ts` : catalogue, achat idempotent, `402` si solde insuffisant, décrément d'inventaire (FR-074, FR-076)
- [x] T193 [US11] Implémenter les règles d'interdiction d'achat d'indices dans `apps/api/src/modules/economy/hint.policy.ts` : exploratoires uniquement, solo uniquement, jamais sorting/event/boss, jamais de révélation de test ou solution (FR-075, clarification 5)
- [x] T194 [US11] Implémenter l'attribution de badges dans `apps/api/src/modules/economy/badges.service.ts` (critères jsonb, une seule attribution) (FR-077)
- [x] T195 [P] [US11] Créer `apps/web/src/pages/shop/ShopPage.tsx` (catalogue, solde, confirmation d'achat, `Idempotency-Key` généré côté client) et `WalletPage.tsx` (historique)
- [x] T196 [US11] Afficher les indices progressifs dans `ChallengePage.tsx` (déverrouillage un par un, prix en Bits, contenu jamais caché côté client avant achat)

**Checkpoint**: US11 livrable seule.

---

## Phase 14: User Story 12 - Explorer le lore et l'ambiance (Priority: P3)

**Goal**: Chapitres débloqués par progression, musique et sons par région, audio après interaction
explicite, équivalents visuels, réduction des animations.

**Independent Test**: débloquer un chapitre par niveau, constater la persistance de lecture ; vérifier
qu'aucun son ne démarre avant interaction et que chaque information sonore a un équivalent visuel.

### Tests for User Story 12 ⚠️

- [x] T197 [P] [US12] Tests d'intégration lore dans `apps/api/test/integration/lore.spec.ts` (déblocage par niveau, persistance de lecture)
- [x] T198 [P] [US12] Tests d'accessibilité audio/animations dans `apps/web/e2e/a11y-media.spec.ts` (aucun son avant interaction, `prefers-reduced-motion` respecté)

### Implementation for User Story 12

- [x] T199 [P] [US12] Créer les modèles Prisma `LoreChapter` (`slug` UNIQUE, `required_level`, `audio_key`) et `LoreProgress` (PK composite, `unlocked_at`, `read_at`) dans `apps/api/prisma/schema.prisma`
- [x] T200 [US12] Implémenter `apps/api/src/modules/content/lore.service.ts` : déblocage par progression, état de lecture, chapitres publics lisibles sans compte confirmé (FR-078, FR-003)
- [x] T201 [US12] Exposer `apps/api/src/modules/content/lore.controller.ts` : `GET /lore/chapters`
- [x] T202 [P] [US12] Créer `apps/web/src/pages/lore/LorePage.tsx` et `LoreChapterPage.tsx` (typographie, progression, audio à la demande)
- [x] T203 [US12] Implémenter le gestionnaire audio `apps/web/src/hooks/useAmbientAudio.ts` : démarrage après interaction explicite uniquement, mixage maître/musique/effets/voix, persistance des préférences (FR-079, FR-080)
- [x] T204 [US12] Ajouter les équivalents visuels de chaque signal sonore et le respect de `prefers-reduced-motion` dans `apps/web/src/styles/motion.css` (FR-081, FR-082)
- [x] T205 [US12] Vérifier `quickstart.md` § S13 (audio sans interaction, animations désactivées)

**Checkpoint**: US12 livrable seule.

---

## Phase 15: User Story 13 - Relever des défis de stéganographie et de QR codes (Priority: P4)

**Goal**: Génération d'images par graine, atelier inverse (cacher un message), QR surchargés,
fragmentés, altérés ; vérification sans révéler la solution.

**Independent Test**: générer deux fois la même instance (image identique), vérifier une réponse correcte
et incorrecte (aucune fuite), résoudre un QR fragmenté.

### Tests for User Story 13 ⚠️

- [x] T206 [P] [US13] Tests pytest du service d'assets dans `services/assets/tests/test_generate.py` et `test_verify.py` (déterminisme, indépendance par sujet, non-fuite, bornes)
- [x] T207 [P] [US13] Tests d'intégration de l'atelier inverse dans `apps/api/test/integration/inverse-workshop.spec.ts` (le joueur cache un message, un autre le retrouve)
- [x] T208 [P] [US13] Tests de la génération QR altérée dans `services/assets/tests/test_qr.py` (fragments, rotation, bruit, surcapacité → `422`)

### Implementation for User Story 13

- [x] T209 [US13] Implémenter le calcul de graine HMAC-SHA256 et le PRNG `xoshiro128**` dans `services/assets/app/generator/seed.py` (contrat §2)
- [x] T210 [US13] Implémenter `services/assets/app/generator/steganography.py` avec Pillow/`stegano` (LSB, capacités, refus des payloads trop longs)
- [x] T211 [US13] Implémenter `services/assets/app/generator/qr.py` : surcharge, fragmentation, rotation, bruit (FR-041, FR-044)
- [x] T212 [US13] Implémenter l'atelier inverse dans `services/assets/app/generator/inverse.py` : le joueur fournit un message, l'image est générée et vérifiable (FR-043)
- [x] T213 [US13] Implémenter `services/assets/app/routes/generate.py` et `verify.py` conformes à `contracts/assets-service.md`, avec cache par clé d'objet et SSE-S3 MinIO
- [x] T214 [US13] Implémenter `apps/api/src/modules/challenges/asset-proxy.controller.ts` : relais authentifié vers le service d'assets, URL signée courte, jamais de graine exposée
- [x] T215 [P] [US13] Créer `apps/web/src/pages/challenges/StegoChallengePage.tsx` (visionneuse d'image, zoom, soumission de texte, atelier inverse) et `QrChallengePage.tsx`

**Checkpoint**: US13 livrable seule.

---

## Phase 16: User Story 14 - Participer à une battle royale (Priority: P4)

**Goal**: Manches synchronisées par l'horloge serveur, élimination des derniers, mode spectateur,
pas de pause sur déconnexion, minimum de participants.

**Independent Test**: event à 8 participants → une manche close élimine le dernier, visible en < 2 s ;
déconnexion sans suspension ; 7 participants → report.

### Tests for User Story 14 ⚠️

- [x] T216 [P] [US14] Tests unitaires de la règle d'élimination dans `apps/api/test/unit/elimination.spec.ts` (1/manche jusqu'à 50, puis 10 % arrondis au supérieur)
- [x] T217 [P] [US14] Tests d'intégration des manches dans `apps/api/test/integration/battle-royale.spec.ts` (transitions à l'échéance, pas de pause, spectateurs)
- [x] T218 [P] [US14] Tests de contrat temps réel des événements `round.*` dans `apps/api/test/contract/realtime-rounds.spec.ts`

### Implementation for User Story 14

- [x] T219 [P] [US14] Créer les modèles Prisma `BattleRound` (UNIQUE `(event_id, round_number)`, `status ∈ {scheduled, open, closed}`) et `RoundResult` (UNIQUE `(round_id, subject_type, subject_id)`, `eliminated`) dans `apps/api/prisma/schema.prisma`
- [x] T220 [US14] Implémenter `apps/api/src/modules/battle-royale/round.service.ts` : planification, ouverture et clôture sur l'horloge serveur, aucune pause sur déconnexion (FR-097, FR-100)
- [x] T221 [US14] Implémenter la règle d'élimination paramétrable dans `apps/api/src/modules/battle-royale/elimination.service.ts` (`elimination_rule` jsonb, défaut `{threshold: 50, percent: 10}`) (FR-098, clarification 4)
- [x] T222 [US14] Implémenter l'élimination et le passage en spectateur dans `apps/api/src/modules/battle-royale/spectator.service.ts` (room `event:<id>:spectators`, chat dédié) (FR-099)
- [x] T223 [US14] Implémenter le minimum de participants et le report dans `apps/api/src/modules/battle-royale/eligibility.service.ts` (`min_participants`, défaut 8) (FR-101)
- [x] T224 [US14] Émettre `round.started`, `round.warning`, `round.closed`, `participant.eliminated`, `event.finished` (contrat §3.5) et garantir la diffusion < 2 s
- [x] T225 [P] [US14] Créer `apps/web/src/pages/events/BattleRoyalePage.tsx` (arène, manche en cours, participants restants, bascule spectateur) et `SpectatorView.tsx`

**Checkpoint**: US14 livrable seule.

---

## Phase 17: User Story 15 - Communiquer par chat textuel et vocal (Priority: P4)

**Goal**: Canaux global, équipe, event, spectateur ; portée stricte ; limitation de débit ; signalements
et modération ; salons vocaux sans enregistrement, micro explicite.

**Independent Test**: message global reçu en < 1 s, écriture refusée dans un canal non autorisé, dépassement
de débit limité, signalement traité, voix active seulement après activation du micro.

### Tests for User Story 15 ⚠️

- [x] T226 [P] [US15] Tests d'intégration chat dans `apps/api/test/integration/chat.spec.ts` (portée par canal, historique, suppression, anonymisation à la suppression de compte)
- [x] T227 [P] [US15] Tests de limitation de débit chat dans `apps/api/test/integration/chat-rate-limit.spec.ts` (par compte et par préfixe IP, `retryAfterMs`)
- [x] T228 [P] [US15] Tests d'autorisation vocale dans `apps/api/test/integration/voice.spec.ts` (jeton court, appartenance au canal, aucun enregistrement exposé)

### Implementation for User Story 15

- [x] T229 [P] [US15] Créer les modèles Prisma `ChatChannel` (UNIQUE `(kind, scope_id)`, `kind ∈ {global, team, event, spectator}`), `ChatMessage` (1–2 000 caractères, `user_id` nullable + `author_label`), `ChatReport`, `ChatSanction` dans `apps/api/prisma/schema.prisma`
- [x] T230 [US15] Implémenter `apps/api/src/modules/chat/chat.service.ts` : envoi idempotent (`clientMessageId`), historique paginé, suppression logique, portée vérifiée côté serveur (FR-091, FR-092)
- [x] T231 [US15] Implémenter `apps/api/src/modules/chat/chat-rate-limit.service.ts` : fenêtre glissante par compte et par IP, `chat.typing` limité à 1 émission / 2 s (FR-093)
- [x] T232 [US15] Implémenter la modération `apps/api/src/modules/chat/moderation.service.ts` : mute, suppression, bannissement, journalisation, notification (FR-094)
- [x] T233 [US15] Implémenter l'émission `apps/api/src/modules/chat/voice.service.ts` : jetons LiveKit à durée courte, après vérification d'appartenance, enregistrement jamais activé (FR-095, FR-096)
- [x] T234 [P] [US15] Créer `apps/web/src/components/chat/ChatPanel.tsx` (messages, présence, indicateur de frappe, signalement) et `ChatMessageList.tsx`
- [x] T235 [P] [US15] Créer `apps/web/src/components/chat/VoiceRoom.tsx` : activation explicite du microphone, indicateur de mute, liste des participants, aucune action d'enregistrement
- [x] T236 [US15] Intégrer les canaux dans `apps/web/src/hooks/useChat.ts` avec gestion de la reconnexion et de l'idempotence d'envoi
- [x] T237 [US15] Vérifier `quickstart.md` § S10 (réception < 1 s, refus inter-canal, modération)

**Checkpoint**: US15 livrable seule.

---

## Phase 18: User Story 16 - Jouer et apprendre sur tous les appareils (Priority: P4)

**Goal**: Responsive mobile/tablette/desktop, PWA installable avec lecture hors ligne, notifications,
clavier de symboles, plein écran, WCAG 2.1 AA, interface française externalisée.

**Independent Test**: parcours critique sur les 4 navigateurs et 3 viewports, installation PWA, lecture
d'un cours hors ligne, navigation clavier seule, zéro violation critique axe.

### Tests for User Story 16 ⚠️

- [X] T238 [P] [US16] Tests Playwright multi-navigateurs et multi-viewports dans `apps/web/e2e/responsive.spec.ts` (SC-016)
- [X] T239 [P] [US16] Tests axe-core sur les parcours critiques dans `apps/web/e2e/a11y.spec.ts` (SC-015)
- [X] T240 [P] [US16] Tests PWA et hors ligne dans `apps/web/e2e/pwa.spec.ts` (installation, cours déjà consulté, aucune donnée de score en cache)
- [X] T241 [P] [US16] Test de non-régression i18n dans `apps/web/test/i18n.spec.ts` (aucun texte en dur, clés françaises complètes)

### Implementation for User Story 16

- [X] T242 [US16] Implémenter les points de rupture responsive et la navigation mobile dans `apps/web/src/components/layout/` (barre inférieure, tiroir, zones tactiles ≥ 44 px) (FR-102)
- [X] T243 [US16] Configurer la PWA `apps/web/public/manifest.webmanifest` et le service worker `apps/web/public/sw.js` : *stale-while-revalidate* pour les cours, *network-only* pour scores/soumissions/économie/temps réel ; mise en cache applicative des cours via `apps/web/src/services/offline.ts` (FR-103)
- [X] T244 [US16] Implémenter les notifications Web Push `apps/web/src/hooks/usePushNotifications.ts` et l'envoi serveur `apps/api/src/modules/notifications/push.service.ts` (events à venir, fin de KO) (FR-104)
- [X] T245 [P] [US16] Créer `apps/web/src/components/editor/SymbolKeyboard.tsx` et le mode plein écran mobile de l'éditeur (FR-105)
- [X] T246 [US16] Corriger l'accessibilité dans `apps/web/src/components/ui/` et `apps/web/src/styles/a11y.css` : contrastes, focus visible, libellés ARIA, ordre de tabulation, annonces de verdict (FR-106)
- [X] T247 [US16] Finaliser l'externalisation des textes dans `apps/web/src/i18n/fr.ts` et vérifier l'absence de chaîne en dur (FR-107)

**Checkpoint**: US16 livrable seule.

---

## Phase 19: User Story 17 - Exploiter et superviser la plateforme (Priority: P5)

**Goal**: HTTPS/HSTS, chiffrement au repos, secrets hors dépôt, CSP, logs masqués, anti-triche,
RGPD, observabilité et alertes, sauvegardes vérifiées, conteneurs non-root avec healthchecks.

**Independent Test**: lancer la campagne de sécurité (ZAP + Gitleaks), vérifier les alertes sur file
bloquée, restaurer une sauvegarde et valider l'intégrité, exporter et supprimer un compte.

### Tests for User Story 17 ⚠️

- [X] T248 [P] [US17] Tests de non-fuite de secrets dans `apps/api/test/security/secrets.spec.ts` (aucun secret dans le dépôt, `.env.example` sans valeur réelle)
- [X] T249 [P] [US17] Tests d'en-têtes de sécurité dans `apps/api/test/security/headers.spec.ts` (HSTS, CSP, `X-Content-Type-Options`, cookies)
- [X] T250 [P] [US17] Tests de détection de similarité dans `apps/api/test/unit/similarity.spec.ts` (normalisation AST, indice de Jaccard, aucun blocage automatique)
- [X] T251 [P] [US17] Test d'intégrité après restauration dans `apps/api/test/ops/restore-integrity.spec.ts` (scores, soldes, états de comptes)

### Implementation for User Story 17

- [X] T252 [US17] Configurer TLS et redirection HTTPS dans `infra/nginx/` (TLS 1.2+, HSTS, en-têtes de sécurité) (FR-108)
- [X] T253 [US17] Durcir `infra/docker-compose.prod.yml` : secrets Docker, réseaux segmentés, conteneurs non-root, healthchecks, `read_only` (FR-118)
- [X] T254 [US17] Mettre en place Gitleaks dans `.github/workflows/security.yml` et la validation d'environnement au démarrage dans `apps/api/src/config/env.ts`, `services/runner/src/config.ts`, `services/assets/app/config.py` (FR-111)
- [X] T255 [US17] Implémenter la détection de similarité asynchrone `apps/api/src/modules/anti-cheat/similarity.job.ts` (tree-sitter, shingles, Jaccard, revue humaine uniquement) (FR-114)
- [X] T256 [US17] Implémenter le registre de consentement et l'export RGPD dans `apps/api/src/modules/privacy/consent.service.ts` (minimisation, accès, rectification) (FR-115)
- [X] T257 [US17] Provisionner Prometheus et Grafana dans `infra/prometheus/` et `infra/grafana/` : latence, profondeur de file, durée d'exécution, taux d'erreur, connexions temps réel (FR-116)
- [X] T258 [US17] Configurer les alertes dans `infra/prometheus/alerts.yml` : file bloquée > 2 min, taux de 5xx > 1 % sur 5 min, échec de sauvegarde (FR-116, SC-013)
- [X] T259 [US17] Mettre en place les sauvegardes quotidiennes et le test de restauration dans `infra/backup/` + `.github/workflows/backup-verify.yml` (FR-117, SC-014)
- [X] T260 [US17] Ajouter les métriques de cohérence `ledger_balance_mismatch_total` et `leaderboard_drift_total` dans `apps/api/src/common/metrics/consistency.metrics.ts` (SC-021)
- [X] T261 [US17] Vérifier `quickstart.md` § S12, S13 et S14 (charge, sécurité, restauration)

**Checkpoint**: US17 livrable seule — plateforme exploitable.

---

## Phase 20: Polish & Cross-Cutting Concerns

**Purpose**: Consolidation transverse, performance, documentation et validation finale.

- [X] T262 [P] Optimiser les requêtes chaudes (catalogue, classement, détail de défi) et ajouter les index manquants dans `apps/api/prisma/migrations/`
- [X] T263 [P] Ajouter des tests de charge k6 dans `infra/load/` (`browse.js`, `submissions.js`, `realtime.js`) et consigner les résultats (SC-003, SC-004, SC-005)
- [X] T264 [P] Compléter la couverture métier à ≥ 80 % (scoring, économie, élimination, prérequis) dans `apps/api/test/` et publier le rapport via `.github/workflows/ci.yml` (SC-012)
- [X] T265 [P] Exécuter OWASP ZAP baseline et la campagne d'évasion documentée, consigner les résultats dans `docs/security/` (SC-008)
- [X] T266 [P] Rédiger la documentation d'exploitation dans `docs/operations/` (runbooks : file bloquée, restauration, rotation de clé AES)
- [X] T267 [P] Rédiger le manuel utilisateur et le guide administrateur dans `docs/user/` et `docs/admin/`
- [X] T268 Nettoyer le code mort, harmoniser les noms de modules et supprimer les `TODO` restants dans `apps/` et `services/`
- [X] T269 Vérifier la cohérence des contrats : `contracts/openapi.yaml` vs implémentation, `contracts/websocket-events.md` vs gateway, `contracts/runner-job.md` vs runner, `contracts/assets-service.md` vs service
- [X] T270 Exécuter l'intégralité de `quickstart.md` (S1 → S14) sur un environnement neuf et consigner les écarts
- [X] T271 Vérifier la conformité constitutionnelle finale (5 principes) et mettre à jour `.specify/memory/constitution.md` si une dérive est constatée
- [X] T272 [P] Configurer la génération automatique des notes de version et le workflow `release.yml` dans `.github/workflows/` : **SemVer**, tags Git annotés `vX.Y.Z` sur `main` après CI verte, `CHANGELOG.md` généré depuis les Conventional Commits (section 11.2)
- [X] T273 Former les mainteneurs : documenter les procédures de validation de défi, de modération et de rotation de secrets dans `docs/operations/onboarding.md`
- [X] T274 [P] E2E du parcours critique complet dans `apps/web/e2e/critical-journey.spec.ts` : inscription → confirmation e-mail → leçon → défi → classement (SC-011, principe IV)
- [X] T275 [P] E2E du cycle de vie du compte dans `apps/web/e2e/account-lifecycle.spec.ts` : réinitialisation de mot de passe, suppression avec réauthentification, anonymisation des scores (SC-011, SC-017)
- [X] T276 [P] E2E de l'event à essai unique dans `apps/web/e2e/event-single-attempt.spec.ts` : ouverture sans consommation, démarrage explicite, second essai refusé, abandon consommé (SC-011, FR-062)
- [X] T277 [P] E2E équipe dans `apps/web/e2e/team-critical.spec.ts` : création, invitation, édition collaborative, désignation officielle, classement d'équipe (SC-011)
- [X] T278 Câbler `pnpm e2e` comme porte bloquante dans `.github/workflows/ci.yml` sur les 4 navigateurs (principe IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Gouvernance (Phase 0)** : aucune dépendance, à exécuter **avant** le Setup — dépôt initialisé et `main` protégée.
- **Setup (Phase 1)** : aucune dépendance, démarre immédiatement.
- **Foundational (Phase 2)** : dépend du Setup — **bloque toutes les histoires**.
- **User Stories (Phase 3 → 19)** : dépendent du Foundational. Entre elles, l'ordre recommandé suit les
  priorités, mais chaque histoire reste indépendamment testable.
- **Polish (Phase 20)** : dépend des histoires retenues pour la livraison.

### Dépendances entre histoires

| Histoire | Dépend de | Raison |
|---|---|---|
| US1 | — | socle d'identité |
| US2 | US1 (auteur de soumission), US4 (défi publiable) | il faut un compte et un défi validé |
| US3 | US2 | pas de classement sans scores |
| US4 | US1 (RBAC) | rôles et audit |
| US5 | US4 (création de défis), US6 (prérequis par cours) | contenu et conditions |
| US6 | US1 | progression par compte |
| US7 | US2, US4 | même boucle de soumission |
| US8 | US1, US2, US3 | équipes, soumission officielle, classement d'équipe |
| US9 | US2, US3, US4 | event = défis + classement + administration |
| US10 | US2, US8 (pool d'équipe) | boss = soumissions + PV partagés |
| US11 | US1, US2 | wallet et achats |
| US12 | US1, US6 (niveaux) | déblocage par progression |
| US13 | US2, US11 (indices) | service d'assets + indices |
| US14 | US9 | battle royale = type d'event |
| US15 | US1, US4 (modération), US8, US9 | canaux par portée |
| US16 | US1 → US15 (parcours complets) | transverse à l'interface |
| US17 | toutes | exploitation de la plateforme complète |
| Polish — E2E critiques (T274-T278) | US1, US2, US3, US6, US8, US9 | parcours E2E transverses exigés par SC-011 et le principe IV |

> Les dépendances sont **de disponibilité fonctionnelle**, pas de couplage de code : chaque histoire
> reste développable et testable dans son périmètre une fois ses prérequis livrés.

### Dans chaque histoire

1. Tests d'abord — ils doivent échouer.
2. Modèles Prisma, puis services, puis contrôleurs/gateways, puis interface.
3. Intégration et vérification du scénario `quickstart.md` associé.

### Opportunités de parallélisme

- Setup : T279–T280 en premier, puis T002–T004, T007–T012, T014–T018 en parallèle.
- Foundational : T022–T032, T036–T044 en parallèle après T019–T021.
- Après le Foundational : US1, US4, US6, US12 peuvent démarrer en parallèle (aucune dépendance croisée).
- Dans une histoire : tous les tests `[P]`, puis les modèles `[P]`, puis les pages web `[P]` pendant que
  l'API se termine.
- Polish : T262–T267, T272 et T274–T277 en parallèle.

## Parallel Example: User Story 2

```bash
# Tests en parallèle (doivent échouer avant implémentation)
Task: "Tests de contrat /challenges/{id}/submissions dans apps/api/test/contract/submissions.contract.spec.ts"
Task: "Tests unitaires de la formule de score dans apps/api/test/unit/scoring.spec.ts"
Task: "Tests golden sorting dans apps/api/test/golden/sorting.spec.ts"
Task: "Tests d'évasion du bac à sable dans services/runner/test/escape.test.ts"

# Puis modèles et briques indépendantes
Task: "Modèles Challenge et ChallengeVersion dans apps/api/prisma/schema.prisma"
Task: "Modèles Submission et BestScore dans apps/api/prisma/schema.prisma"
Task: "Profil seccomp infra/seccomp/runner.json"
Task: "Éditeur Monaco apps/web/src/components/editor/CodeEditor.tsx"
```

## Implementation Strategy

### MVP (P1 uniquement — US1 → US5)

1. Phase 1 (Setup) puis Phase 2 (Foundational) — obligatoires.
2. US1 (identité) → US4 (contenu publiable) → US5 (catalogue) → US2 (soumission/scoring) → US3
   (classement).
3. **Arrêt et validation** : exécuter `quickstart.md` S1, S2, S3, S5.
4. Déployer/démontrer le MVP : compte, défi de tri noté, classement, administration.

> Le MVP suit l'ordre US1 → US4 → US5 → US2 → US3 car US2 exige un défi validé par US4 et un
> catalogue par US5 ; les priorités déclarées restent P1 pour les cinq.

### Livraison incrémentale

1. Setup + Foundational → socle prêt.
2. P1 (US1–US5) → MVP validé.
3. P2 (US6–US9) → parcours pédagogique, débogage, équipes, events.
4. P3 (US10–US12) → boss, économie, lore.
5. P4 (US13–US16) → assets avancés, battle royale, chat/voix, multi-appareils.
6. P5 (US17) + Polish → exploitation, sécurité, supervision.

### Équipe parallèle

1. Toute l'équipe termine Setup + Foundational.
2. Ensuite : développeur A = US1/US4, développeur B = US2, développeur C = US3/US5, développeur D =
   runner + assets.
3. Chaque histoire est fusionnée après ses propres tests, sans casser les précédentes.

## Notes

- `[P]` = fichiers différents, aucune dépendance en cours.
- Le libellé `[USn]` assure la traçabilité vers `spec.md`.
- Les tests s'écrivent **avant** l'implémentation et doivent échouer (principe IV).
- Chaque checkpoint est un point d'arrêt valide pour une démonstration.
- Éviter : tâches vagues, conflits sur un même fichier, dépendances croisées qui brisent l'indépendance.
- Les contraintes de champs (longueurs, enums, unicité) sont reprises de `data-model.md` et doivent être
  appliquées **en base et en validation applicative**.
