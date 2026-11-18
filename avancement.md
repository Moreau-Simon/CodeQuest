# Avancement — Session Spec Kit / CodeQuest

**Date de session** : 18 novembre 2026
**Feature** : `001-codequest-platform` (spécification couvrant toute la plateforme, 5 phases / 17 histoires)
**Statut global** : workflow Spec Kit terminé (`analyze` inclus). **Implémentation en cours** : Phase 0, Phase 1, Phase 2, **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**, **US4 (Phase 6)** et **US5 (Phase 7)** terminées et vérifiées. Plateforme opérationnelle en environnement local (`pnpm dev` sur `http://localhost:5173`). Phases 8 → 20 restantes (T129–T278).

**Dernière mise à jour** : 18 novembre 2026 — US5 livrée (graphe acyclique de prérequis DAG, déblocage automatique multi-conditions, catalogue filtrable et page CatalogPage), tests verts, commit US4 enregistré.

---

## 1. Objectif de la session

Installer GitHub Spec Kit à la racine du projet CodeQuest, puis exécuter le workflow complet sur une spécification unique couvrant l'intégralité de la plateforme (pas un seul incrément) :

`constitution` → `specify` → `clarify` → `plan` → `tasks` → `analyze`

Sources utilisées :

- `Spécification fonctionnelle et technique – Plateforme de défis informatiques.pdf`
- `PLAN_DE_REALISATION.md` (feuille de route 6 phases + matrice MoSCoW)

Contraintes actées :

- Réponses et documentation en français.
- La constitution est **non négociable** dans le périmètre d'analyse.
- `/speckit.analyze` est **strictement en lecture seule** ; toute remédiation nécessite un accord explicite.

---

## 2. Environnement et installation

| Élément | État |
|---|---|
| Spec Kit | Installé à la racine via `specify init . --integration opencode` (`specify-cli` v1.4.0, lancé avec `uv`) |
| Dossiers générés | `.specify/` (memory, scripts, templates), `.opencode/commands/speckit.*.md` |
| `.specify/extensions.yml` | **Absent** → tous les hooks `before_*` / `after_*` sont silencieusement ignorés (signalé dans chaque rapport) |
| `.specify/feature.json` | `{"feature_directory":"specs/001-codequest-platform"}` |
| Dépôt git | Initialisé ; commits Conventional Commits ; `main` locale (pas de remote → T280 en attente) |
| OS / shell | macOS (darwin), zsh |

---

## 3. Artefacts produits (tous sous `specs/001-codequest-platform/`)

| Fichier | Lignes | Contenu |
|---|---|---|
| `.specify/memory/constitution.md` | 197 | **v1.0.0**, ratifiée le 2026-11-13, 5 principes |
| `spec.md` | 940 | 17 histoires (P1–P5), **118 FR**, **22 SC**, 21 entités clés, cas limites, hypothèses, 5 clarifications |
| `plan.md` | 194 | Technical Context, Constitution Check (avant + après conception), structure monorepo, Complexity Tracking |
| `research.md` | 250 | Décisions **R1–R20** + table des constantes d'équilibrage |
| `data-model.md` | 367 | **45 tables**, 15 enums, transitions d'état, règles d'intégrité, rétention |
| `tasks.md` | 750 | **280 tâches** (T001–T280), 20 phases + Phase 0, 143 marquées `[P]` ; **101 cochées** |
| `checklists/requirements.md` | — | **16/16** |
| `contracts/openapi.yaml` | 936 | Validé : parse OK, 42 chemins, 19 schémas, 20 `$ref` tous résolus |
| `contracts/websocket-events.md` | 191 | Événements temps réel |
| `contracts/runner-job.md` | 176 | Contrat job runner (isolation, mesures, propriété du score) |
| `contracts/assets-service.md` | 168 | Contrat du service Python d'assets |
| `quickstart.md` | 212 | Scénarios **S1–S14** mappés aux SC |
| `versioning.md` | — | Norme de versionnage (§11.2) : monorepo, branches, Conventional Commits/SemVer, `challenge_versions`, migrations |

### Stack retenue

NestJS 10 + Prisma 6 + PostgreSQL 16 + Redis 7 (ZSET, BullMQ) + MinIO + React 18/Vite/Tailwind/Monaco + Socket.IO + Yjs + LiveKit + service assets Python 3.12 + runner gVisor + Docker Compose + GitHub Actions + Prometheus/Grafana.

### Architecture de fichiers imposée (section 11.2 — Versionnage)

Monorepo **unique**, compartimenté en modules autonomes :

```text
apps/web/  apps/api/  services/runner/  services/assets/  infra/  docs/
```

- **Pas de dossier `packages/`** : les types partagés sont générés depuis `contracts/openapi.yaml` vers `apps/web/src/services/`.
- `main` protégée ; travail sur `feat/...` / `fix/...` ; fusion par PR + relecture d'un pair + CI verte.
- Conventional Commits (commitlint), SemVer + tags Git, `CHANGELOG.md` généré.
- `challenge_versions` historise énoncés/tests/seuils ; migrations Prisma versionnées et reproductibles.

Détail complet : `specs/001-codequest-platform/versioning.md`, repris dans `plan.md` § Versionnage et livraison.

### Constitution v1.0.0 — 5 principes

1. **I. Isolation sandbox** (non négociable)
2. **II. Sécurité par défaut**
3. **III. Score équitable sur temps CPU**
4. **IV. Tests d'abord + portes CI bloquantes**
5. **V. Modularité / MoSCoW + gouvernance** (semver, 2 approbations)

### Clarifications intégrées (5)

1. Score d'équipe = **soumission officielle unique** désignée par le capitaine (aucune agrégation).
2. Le chrono démarre au **démarrage explicite d'essai**.
3. Compte non confirmé = **lecture seule publique**.
4. Battle royale = 1 élimination/manche jusqu'à 50 restants, puis 10 % arrondis au supérieur.
5. Indices achetables = défis **exploratoires uniquement, en solo**, jamais sorting/event/boss.

---

## 4. Remédiations déjà appliquées (1ʳᵉ analyse → corrections)

### C1 — E2E des parcours critiques (CRITIQUE, résolu)

- `tasks.md` : ajout de **T274–T277** (parcours critique, cycle de vie du compte, event à essai unique, équipe) et **T278** (câblage `pnpm e2e` en porte CI bloquante, 4 navigateurs).
- `tasks.md` : table des dépendances + règle de parallélisme mises à jour.
- `plan.md` : Constitution Check IV désormais justifié par T274–T278 → **PASS** étayé.

### A1 — Propriété unique du calcul de score (résolu)

- `contracts/runner-job.md` §3 : champ `"score"` **retiré** du résultat de job.
- `contracts/runner-job.md` §4 : section renommée « Composants renvoyés et propriété du calcul » ; le runner ne calcule **aucun** score.
- `tasks.md` T075 : `scoring.service.ts` désigné **source unique** du calcul.
- Vérifié : plus aucune clé `"score"` dans le résultat (seul `"mode": "score"` subsiste).

### A2 — `max_attempts` vs FR-065 (partiellement résolu)

- `spec.md` FR-065 : « …with no configurable value allowing more than one attempt in v1 ».
- `data-model.md` : `CHECK max_attempts = 1` en v1, champ conservé pour évolution par amendement.
- `data-model.md` : ligne d'intégrité FR-065 complétée par le CHECK.
- ✅ **Résolu avant implémentation** (voir finding I1 ci-dessous).

### A3 — Consommation de l'essai sur abandon (résolu)

- `tasks.md` T168 : job `attempt-expiry.job.ts`, abandon/fermeture ⇒ essai consommé.
- `tasks.md` T163 : cas de test d'abandon ajouté.
- `data-model.md` `event_participants` : règle de consommation à l'expiration documentée.

### A4 — Classement d'équipe après désignation (résolu)

- `tasks.md` T157 : recalcul transactionnel de `best_scores(team)` + ZSET `team:<id>`.
- `tasks.md` T150 : test du classement après désignation **et** après remplacement.
- `data-model.md` `team_official_submissions` : règle de recalcul et de révocation documentée.

### Corrections de cohérence (résolues)

- `plan.md` arborescence : modules `audit/`, `notifications/`, `privacy/`, `anti-cheat/` + dossiers `mail/`, `queue/`, `redis/`, `storage/`.
- `contracts/runner-job.md` §8 : refs FR corrigées (FR-027, FR-028, FR-110 + principe I).
- `contracts/assets-service.md` §9 : refs FR corrigées (FR-028, FR-027 + principe I).
- Erreur de décalage d'indices détectée et corrigée dans les deux tableaux de conformité.

### Versionnage §11.2 (ajouté sur demande explicite)

- Création de `specs/001-codequest-platform/versioning.md` (norme opposable : monorepo, branches, commits, SemVer, `challenge_versions`, migrations).
- `plan.md` : nouvelle sous-section « Versionnage et livraison » + arborescence racine complétée (`CODEOWNERS`, `CHANGELOG.md`, `commitlint.config.cjs`, `.gitignore`, `.github/pull_request_template.md`).
- `tasks.md` : **Phase 0** ajoutée avant le Setup — **T279** (init git, `.gitignore`, `main`) et **T280** (protection de `main`, PR, CODEOWNERS, checks requis).
- `tasks.md` T004 : ajout de **commitlint** + hook `commit-msg` → finding **C4 résolu**.
- `tasks.md` T272 : précision SemVer + tags annotés + `CHANGELOG.md` généré.

---

## 5. Résultats de la 2ᵉ analyse (`/speckit.analyze`, lecture seule)

**0 problème CRITIQUE. 1 HIGH. 3 incohérences. 3 duplications. 3 ambiguïtés.**

> **I1 résolu** pendant l'implémentation : `tasks.md` T166 et `contracts/openapi.yaml` (`Event.maxAttempts: enum [1]`) sont désormais alignés sur `data-model.md` / FR-065.

### Métriques

| Métrique | Valeur |
|---|---|
| Exigences totales | **140** (118 FR + 22 SC) |
| Tâches totales | **280** (T001→T280, 0 trou, 0 doublon) |
| Couverture explicite FR+SC | **126/140 = 90 %** (FR 112/118, SC 14/22) |
| Couverture sémantique | **140/140 = 100 %** |
| Tâches avec référence FR/SC explicite | 106/280 = 38 % |
| Checks de format des tâches | 280/280 conformes |
| Tâches cochées | **117/280** (Phase 0–2 + US1 + US2 + US3 + US4) |
| Liens relatifs cassés | 0 |
| `openapi.yaml` | parse OK, 42 chemins |

### Findings ouverts (à traiter)

| ID | Sévérité | Résumé | Emplacements |
|---|---|---|---|
| **A5** | **HIGH** | « resolution time » non défini (début/fin, impact indices et essais) — touche le principe III | `spec.md:634-636` (FR-039) |
| D4 | MEDIUM | Double source de la soumission officielle : `submissions.is_official` **et** `team_official_submissions` | `data-model.md:163`, `tasks.md:158`, `websocket-events.md:56` |
| T2 | MEDIUM | Confusion `theme` vs type de défi (`challenge_type`) | `spec.md:600`, `data-model.md`, T072 |
| C5 | MEDIUM | Réversibilité des migrations affirmée mais jamais testée (seul `migrate deploy` sur base vide) | `tasks.md:69` (T021), `plan.md:75` |
| C3 | MEDIUM | axe-core testé (T239) mais **aucune porte CI bloquante** ; T278 ne câble que `pnpm e2e` | `tasks.md:573`, `tasks.md:640` |
| U2 | MEDIUM | Source de la liste de mots de passe compromis non spécifiée (FR-002) | `spec.md:557` |
| D1 | MEDIUM | Doublon FR-029 ↔ FR-085/086 (validation à 100 %) | `spec.md:600`, `spec.md:664-667` |
| D2 | MEDIUM | Doublon FR-042 ↔ FR-074 (achat d'indices exploratoires solo) | `spec.md:612`, `spec.md:648` |
| D3 | LOW | Recouvrement FR-028 ↔ FR-110 (transport vs repos) | `spec.md:598`, `spec.md:686` |
| E2 | LOW | 6 FR non annotées dans `tasks.md` : FR-004, 005, 031, 042, 045, 048 | `tasks.md` |
| E1 | LOW | 8 SC non annotés : SC-001, 002, 006, 007, 018, 019, 020, 022 | `tasks.md` |
| E3 | LOW | 174/280 tâches sans référence FR/SC explicite (surtout socle et Polish) | `tasks.md` |
| T1 | LOW | Bilinguisme spec : prose FR, FR/SC en anglais | `spec.md` |
| T3 | LOW | Plan annonce « ~30 agrégats » vs 45 tables réelles | `plan.md:59` |
| U1 | LOW | Formulation ambiguë T015 « `packages`-free génération de types client » — **cohérent avec §11.2 (pas de `packages/`)** | `tasks.md:56` |
| U3 | LOW | Minimisation RGPD non quantifiée (FR-115) | `spec.md:691` |
| T5/T6 | LOW | Entités du modèle absentes des « 21 entités clés » ; `users.level` dérivé mais stocké | `spec.md` §entités, `data-model.md` |

### Constitution Check final

Aucune violation. Les 5 principes sont **PASS** (IV et III désormais étayés par des tâches).

---

## 6. Prochaines étapes (session suivante)

### État d'implémentation

| Phase | Tâches | État |
|---|---|---|
| Phase 0 — Gouvernance | T279 | ✅ fait (T280 partiel : protection distante en attente d'un remote) |
| Phase 1 — Setup | T001–T018 | ✅ fait et vérifié (lint, typecheck, tests, build) |
| Phase 2 — Foundational | T019–T044 | ✅ fait et vérifié |
| Phase 3 — US1 | T045–T066 | ✅ fait et vérifié |
| Phase 4 — US2 | T067–T090 | ✅ fait et vérifié |
| Phase 5 — US3 | T091–T100 | ✅ fait et vérifié |
| Phase 6 — US4 | T101–T116 | ✅ fait et vérifié |
| Phase 7 — US5 | T117–T128 | ✅ fait et vérifié |
| Phases 8 → 20 | T129–T278 | ⏳ à faire (démarrage : US6, T129) |

**129/280 tâches cochées.** Vérifications passées (18 nov. 2026) :
- `pnpm lint` (3 packages : 0 erreur).
- `pnpm typecheck` (3 packages : 0 erreur).
- `pnpm --filter @codequest/api test` (**98 tests**, 19 suites dont `prerequisites.spec.ts`).
- `pnpm --filter @codequest/web test` (**45 tests**, 15 suites dont `catalog-page.test.tsx`).
- `pnpm --filter @codequest/runner test` (**8 tests**, 2 suites).
- `pnpm --filter @codequest/api test:integration` (intégrations déblocage et audit validées).
- `pnpm --filter @codequest/api test:e2e` (non-fuite des tests cachés SC-007).
- Déploiement Prisma et seed local vérifiés sur PostgreSQL.
- Démarrage parallèle local `pnpm dev` opérationnel : Web (Vite `:5173`), API (NestJS `:3000`), Runner (BullMQ `:6379`).

### Journal de la session du 18 novembre 2026

| Étape | Résultat |
|---|---|
| Commit US4 | Commit `6178315` enregistré (`feat(admin): module d'administration, validation de défis et outillage dev (US4)`) |
| Phase 7 / US5 (TDD) | Tests unitaires du graphe de prérequis (T117 : DAG, cycle, 4 conditions), intégration du déblocage (T118 : 4 types de conditions), contrat OpenAPI `/challenges` (T119 : catalogue, 403 motivé) |
| Schéma & Persistance | Modèle `ChallengePrerequisite` avec contraintes CHECK (exclusivité et niveau ≥ 1), modèles `Lesson`, `LessonProgress`, `LoreChapter`, `LoreProgress`, migration `20261118180000_us5_prerequisites_lessons` |
| Résolveur de DAG | `PrerequisiteGraphService` (DFS détection de cycle direct/indirect/auto-référence, `assertAcyclic`, `canAddEdge`) |
| Évaluation dynamique | `PrerequisiteCheckService` (`evaluate`, `evaluateMany` en lot optimisé, calcul des statuts `locked`, `available`, `completed`, motifs détaillés `missingPrerequisites`) |
| Contrôleur & Service | `ChallengesService` et `ChallengesController` (filtrage multi-critères, 403 Forbidden `CHALLENGE_LOCKED`, vérification dans `requirePlayable`, déclaration des langages supportés) |
| Traçabilité d'audit | Événements d'audit des prérequis et thématiques dans `audit.events.ts` (T126) |
| Interface Web Catalogue | Création de `CatalogPage.tsx` (filtres thématique/difficulté/type/statut, badges de difficulté étoilés, tooltip informatif des prérequis au survol, désactivation propre) et tests Vitest associés (T127, T128) |

Commits de la session :

```
c6b69aa perf(api): éviter la reconstruction des portées vides
c12e009 feat(api,web): livrer les classements temps réel (US3)
8d2d742 docs(tasks): cocher US1 et US2 et consigner l'avancement
d553d8e feat(web): parcours d'authentification, catalogue et éditeur de défis
f884d19 feat(runner): bac à sable gVisor, mesure CPU et verdicts bruts
00b586f feat(api): identité, sessions, défis et soumissions sécurisées
```

### Phase 2 — ce qui a été livré (T019–T044)

**Persistance / socle API**

- Modèles Prisma identité, RBAC, audit et `platform_settings` ; migration `20261113142850_init` avec `citext`, contraintes `CHECK` et triggers append-only sur `audit_logs` ; `migrate deploy` vérifié sur base vide.
- Transverse : UUIDv7 monotone, AES-256-GCM versionné (`[len key_id][key_id][nonce 12][ciphertext][tag 16]`, AAD = `challenge_version_id`), `Clock`, `RequestContextMiddleware` (requestId + préfixe IP /24 ou /48), `PrismaService`, filtre d'exceptions normalisé, logger pino avec masquage, `RateLimitService`/guard/décorateur, `RbacGuard` (refus par défaut, `@Public()` sur santé/métriques), `AuditService`, `MailService`, `QueueService` (priorités BullMQ 1/2/3/4), `MetricsService`, `HealthService`, gateway Socket.IO avec `RealtimeSessions`, JWT d'accès HS256 (15 min) et seed RBAC idempotent.
- Modules Nest câblés, `main.ts` durci (Helmet/CSP/HSTS, cookies signés, préfixe `/api/v1`, CORS, body limit 512 kb, `trust proxy`).
- Tests : `test/contract.spec.ts` (7 tests) + `test/integration/foundation.spec.ts` (6 tests) via Testcontainers (`postgres:16-alpine`, `redis:7-alpine`, `prisma migrate deploy`).

**Socle web**

- Client API typé (`services/api-client.ts`, erreurs `ApiError`), client TanStack Query, store Zustand de session, `SessionProvider`, `AppLayout` (lien d'évitement, `aria-current`), `RequireAuth`, et design system accessible `Button`, `Input`, `Field`, `Modal`, `Toast`, `Skeleton` (FR-106).
- Routage public + `/profile` protégé, i18n fr enrichie ; **38 tests Vitest** après US1/US2.

**Décisions techniques prises pendant la Phase 2**

- `@typescript-eslint/consistent-type-imports` **désactivé** : l'autofix transformait les classes injectables en `import type`, ce qui cassait l'injection Nest (`design:paramtypes` → `Function`) → erreur « Nest can't resolve dependencies ».
- `apps/api/tsconfig.json` force `isolatedModules: false` (incompatible avec `emitDecoratorMetadata`) ; `tsconfig.build.json` exclut `src/**/*.spec.ts` et `test/**`.
- Healthchecks Docker/Compose alignés sur `/health/live` (routes hors préfixe `/api`).

### Phase 3 — US1 (T045–T066) : identité et sessions

- Contrat `/auth/*` + `/me` (15 tests) et intégration inscription/connexion/rotation/réutilisation de refresh (famille révoquée).
- `modules/auth` : DTO, Argon2id + liste de mots de passe compromis, inscription `pending`, sessions (refresh opaque haché, rotation, plafond 30 j), verrouillage progressif (5 échecs → 401 puis **423**), reset 1 h, e-mails, audit, rate limits dédiés.
- `modules/users` : profil, préférences, export RGPD, sessions, suppression logique avec anonymisation et purge J+30 (`AccountPurgeJob`, cron `0 3 * * *`).
- Web : pages inscription/connexion/mot de passe oublié/réinitialisation/confirmation, profil, sessions, dialogue de suppression ; E2E Playwright avec interception réseau.
- Correctifs de fin de phase : `POST /auth/refresh` sous `/api/v1`, cookie `refresh_token` `Path=/api/v1/auth`, suppression de compte compatible avec `submissions.user_id NOT NULL` (compte transformé en tombeau à la purge).

### Phase 4 — US2 (T067–T090) : défis de tri, score et verdict

- Schéma Prisma : `Theme`, `Challenge`, `ChallengeVersion`, `Submission`, `BestScore` + enums, migration `20261116115525_us2_challenges_submissions` avec contraintes `CHECK` (difficulté 1–5, langages, seuils, bornes de score).
- **Score** : `ScoringService` source unique (`base × ratio tests + perf_max × clamp(...)`, arrondi centième) ; **aucun test réussi ⇒ score 0** ; golden 332.43 / 420 / 0 / 214.86.
- API : `ChallengesService` (catalogue public + détail sans tests), `SubmissionsService` (idempotence `Idempotency-Key`, `202`, refus compte non confirmé), `VerdictConsumer` (transaction submission + best score, émission `submission.*`), gateway temps réel.
- Runner : worker BullMQ, ledger d'idempotence, déchiffrement AES des tests (AAD = version), harnais Python/JS, mesure CPU cgroup (5 runs, médiane, confirmation si écart > 20 %), limites, détection d'abus, DLQ, `/metrics`.
- Isolation : args Docker `--network=none`, `--read-only`, `--cap-drop=ALL`, UID 10001, `--pids-limit`, `tmpfs`, runtime `runsc` + profil seccomp `infra/seccomp/runner.json` ; images `runtimes/*.Dockerfile` épinglées par digest.
- Web : `ChallengesPage`, `ChallengePage`, `CodeEditor` (Monaco, plein écran), `useSubmissionVerdict` (Socket.IO + repli 2 s), panneau de verdict filtré.
- Seed : `prisma/seed/challenges.ts` (20 cas dont 12 cachés, chiffrés) et `prisma/seed/index.ts` ; script `test:e2e` pour la non-fuite SC-007.

### Phase 5 — US3 (T091–T100) : classements

- Schéma Prisma : `Season` et `LeaderboardEntry` (miroir durable, `scope_id` UUID sentinelle pour `global` afin que l'unicité PostgreSQL couvre aussi la portée globale), migration `20261116130000_us3_leaderboards` avec `CHECK` (score ≥ 0, rang ≥ 1, cohérence `global`/`scope_id`).
- **Encodage ZSET** : `score_cents × 10^10 + (MAX_TS − timestamp_s)` ; le multiplicateur dépasse l'amplitude du timestamp, donc un centième de point domine toujours le départage. Tri décroissant = score décroissant puis soumission retenue la plus ancienne (FR-048).
- `LeaderboardService` : agrégation SQL depuis `best_scores` (global, thématique, saison, équipe) et depuis `submissions` (événement), écriture ZSET après commit PostgreSQL via `VerdictConsumer`, miroir `leaderboard_entries`, pagination par curseur opaque, position personnelle.
- Filtres de période (`period.filter.ts`) : semaine ISO UTC, mois UTC, saison active, tout temps. Aucune saison active ⇒ résultat vide explicite.
- Reconstruction (`rebuild.job.ts`) : file BullMQ répétable (`LEADERBOARD_REBUILD_INTERVAL_MS`, 5 min par défaut), réécriture complète et vérification d'identité ZSET ↔ miroir ↔ PostgreSQL (`verifyIdentity`, SC-009).
- Temps réel : `leaderboard.updated` incrémental via `LeaderboardGateway` ; abonnement client `leaderboard.subscribe` (rooms par portée, type de sujet et période).
- Web : `LeaderboardPage` (onglets joueurs/équipes/événements, filtres portée/période, position personnelle, invalidation TanStack Query sur événement temps réel), i18n fr enrichie.
- Tests : intégration classement (8), reconstruction (4), contrat `/leaderboards/*` (4).

### Phase 6 — US4 (T101–T116) : administration et modération

- **Validation de défi sandboxée (`challenge-validation.service.ts`)** : exécution de la solution de référence via le runner gVisor/mock, obligation de passer 100 % des tests (visibles et cachés, FR-029/FR-085/FR-086), calibrage automatique de `t_opt_ms` et `t_max_ms`, retour précis du test fautif en cas d'échec (`422 Unprocessable Entity`).
- **Gestion des défis (`challenges.admin.service.ts`, `challenges.admin.controller.ts`)** : création de brouillon, édition, validation obligatoire avant publication, versionnement immuable après publication (`challenge_versions`), archivage logique (FR-084, FR-087).
- **Contrôle d'accès RBAC et politique de modération (`role.service.ts`, `moderation.policy.ts`, `users.admin.controller.ts`)** :
  - Refus par défaut (@Public explicite requis), interdiction formelle d'auto-attribution de rôle (FR-018, FR-020).
  - Politique de modération hiérarchique : un modérateur ne peut pas suspendre ou modifier les rôles d'un administrateur ni d'un pair (FR-090).
  - Actions utilisateurs : suspension temporaire, réactivation, révocation administrative de sessions et anonymisation anticipée (FR-088).
- **Journal d'audit immuable (`audit.controller.ts`, `audit.service.ts`)** : consultation filtrée (`GET /admin/audit-logs` par acteur, cible, plage temporelle) d'un journal garanti append-only par triggers PostgreSQL (rejet formel de tout `UPDATE` ou `DELETE`, FR-089).
- **Signalements et observabilité (`reports.service.ts`, `stats.controller.ts`)** :
  - Cycle de vie des signalements de chat (`open → reviewed | dismissed`, notification de la sanction, FR-094).
  - Statistiques de plateforme : nombre d'utilisateurs actifs, défis les plus résolus, taux de réussite, profondeur des files BullMQ (`submissions`, `results`, `dlq`, `emails`).
- **Interface Web React Administrateur (`apps/web/src/pages/admin/`)** :
  - `AdminDashboardPage` : vue d'ensemble métriques, files BullMQ et alertes.
  - `ChallengeEditorPage` : éditeur Markdown de consigne, gestion des tests visibles et cachés chiffrés, exécution de la solution de référence et diagnostic d'erreur.
  - `UsersAdminPage` : recherche, modification des rôles et suspension.
  - `AuditLogPage` : explorateur d'audit paginé et filtré en lecture seule.
- **Tests** : validation de défi (T101), refus RBAC et auto-attribution (T102), immuabilité de l'audit (T103), tests de rendu et formulaires Web (15 tests Vitest).

### Phase 7 — US5 (T117–T128) : thématiques, catalogue et prérequis (DAG)

- **Graphe acyclique orienté (DAG, `prerequisite-graph.service.ts`)** : parcours en profondeur (DFS) pour détecter tout cycle direct, indirect ou auto-référence (FR-024). Validation stricte de l'exclusivité d'exactement une des 4 conditions par enregistrement (`validatePrerequisiteExclusivity`, FR-023).
- **Persistance des prérequis et parcours (`schema.prisma`, migration `20261118180000_us5_prerequisites_lessons`)** :
  - `challenge_prerequisites` avec contraintes CHECK SQL d'exclusivité (exactement 1 champ parmi les 4 non nul) et de borne de niveau (`required_level >= 1`).
  - Tables socles pour les parcours : `lessons`, `lesson_progress`, `lore_chapters`, `lore_progress`.
- **Évaluation dynamique des prérequis (`prerequisite-check.service.ts`)** :
  - Support des 4 types de conditions : défi préalable validé (`bestScore > 0`), niveau minimum (`user.level >= requiredLevel`), cours terminé (`lesson_progress.status = 'completed'`), chapitre de lore atteint (`lore_progress`).
  - Statuts dynamiques : `'locked'`, `'available'`, `'completed'`.
  - Motifs précis et explicites d'invalidation renvoyés au joueur (`missingPrerequisites`).
  - Évaluation unitaire (`evaluate`) et en lot optimisée (`evaluateMany`) en 4 requêtes groupées sans saturation N+1.
- **Catalogue et sécurité d'accès (`challenges.service.ts`, `challenges.controller.ts`)** :
  - `GET /challenges` : filtres multi-critères (thématique, difficulté 1–5, type de défi, statut), statut contextualisé selon l'utilisateur authentifié.
  - `GET /challenges/{id}` : accès public direct aux défis disponibles ; refus `403 Forbidden` (`CHALLENGE_LOCKED`) avec liste des prérequis manquants si le défi est verrouillé pour le demandeur (T124).
  - Verrouillage à la soumission : `requirePlayable` bloque l'envoi de code si les prérequis ne sont pas satisfaits.
  - Support de 2 langages minimum (`python`, `javascript`, FR-026).
  - Événements d'audit des modifications de prérequis et thèmes (`audit.events.ts`, T126).
- **Interface Web React (`CatalogPage.tsx`)** :
  - Grille de filtres dynamique (thématique, difficulté, type, statut).
  - Badges de difficulté stylisés (1 à 5).
  - Badges de statut (`Disponible`, `Validé` avec meilleur score, `Verrouillé` avec cadenas).
  - Tooltip accessible au survol et au clavier listant les prérequis manquants.
  - Bouton d'ouverture désactivé sur les défis verrouillés.
- **Tests** :
  - Unitaires : `apps/api/test/unit/prerequisites.spec.ts` (13 tests passants : diamant DAG, cycle direct, transitif, auto-référence, exclusivité des 4 types).
  - Intégration : `apps/api/test/integration/unlock.spec.ts` (validation du déblocage par niveau, défi réussi, leçon terminée, lore atteint, statut `completed`).
  - Contrat : `apps/api/test/contract/challenges.contract.spec.ts` (schémas OpenAPI, filtres, 403 motivé si verrouillé, 404).
  - Frontend : `apps/web/src/pages/challenges/catalog-page.test.tsx` (rendu des badges, tooltips de prérequis, état verrouillé).

### À faire immédiatement (reprise session suivante)

1. **Commit de la Phase 7 (US5)** :
   ```bash
   git add .
   git commit -m "feat(challenges): catalogue, graphe acyclique de prérequis (DAG) et déblocage dynamique (US5)"
   ```
2. **Phase 8 / US6 (T129–T138)** — Suivre un cours et progresser dans un parcours (Priority: P2) :
   - Écriture des tests d'abord (TDD) :
     - `T129 [P] [US6]` : `apps/api/test/unit/xp.spec.ts` (courbe d'XP, monotonie, paliers, aucun niveau négatif).
     - `T130 [P] [US6]` : `apps/api/test/integration/lessons.spec.ts` (progression, quiz et dispense par test de positionnement).
     - `T131 [P] [US6]` : `apps/api/test/contract/lessons.contract.spec.ts`.
   - Implémentation du service d'XP `xp.service.ts` et des leçons `lessons.service.ts`.
   - Interface Web : `LessonPage.tsx`, `QuizRunner.tsx`.
3. **A5** — Définir la formule exacte et les bornes de « resolution time » avant la Phase 9 (US7, FR-039).
4. **D4** — Trancher l'unicité de la source de vérité pour `is_official` avant la Phase 11 (US8, T157).
5. **T280** — Appliquer `infra/github/protect-main.sh` dès qu'un remote GitHub sera configuré.

### Points de calibration différés (non bloquants)

- Courbe d'XP / paliers de niveau.
- Prix des indices/potions et récompenses en Bits.
- Durée exacte d'inactivité de session.

Des valeurs par défaut existent dans `research.md`.

---

## 7. Commandes utiles

```bash
# Développement (pnpm via corepack si absent du PATH)
corepack pnpm install
corepack pnpm dev            # API :3000 + web :5173
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:integration
corepack pnpm e2e            # Playwright (navigateurs à installer une fois)
corepack pnpm test:a11y

# Tests ciblés (US1/US2)
corepack pnpm --filter @codequest/api test              # unitaires + golden
corepack pnpm --filter @codequest/api test:integration  # contrats + intégration (Testcontainers)
corepack pnpm --filter @codequest/api test:e2e          # non-fuite SC-007
corepack pnpm --filter @codequest/runner test           # évasion + idempotence

# Seed local (RBAC + défi de tri) : l'API exige une configuration complète
DATABASE_URL='postgresql://codequest:codequest@localhost:5433/codequest?schema=public' \
REDIS_URL='redis://localhost:6379' \
SESSION_SECRET='dev-session-secret-at-least-32-characters' \
AES_KEY_BASE64='dGVzdC1hZXMtMjU2LWtleS0zMi1ieXRlcy1sb25nISE=' \
LIVEKIT_API_SECRET='dev-livekit-secret' \
corepack pnpm --filter @codequest/api prisma:seed

# Services locaux
docker compose -f infra/docker-compose.yml up -d postgres redis minio mailhog livekit
cd services/assets && uv run pytest

# Régénérer les types client depuis le contrat
corepack pnpm --filter @codequest/web generate:types

# Vérifier les prérequis Spec Kit (depuis la racine)
bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks

# Régénérer le texte du PDF de spécification si nécessaire
uv run --quiet --with pypdf python -c "..."
# (sortie de travail : /private/var/folders/7w/9hcc0y990hg3tpf67m4wgny80000gn/T/opencode/spec_pdf.txt)

# Valider le contrat OpenAPI
uv run --quiet --with pyyaml python -c "import yaml;d=yaml.safe_load(open('specs/001-codequest-platform/contracts/openapi.yaml'));print('ok',len(d['paths']))"

# Vérifier le format / la séquence des tâches
uv run --quiet python - <<'EOF'
import re, collections
p='specs/001-codequest-platform/tasks.md'
pat=re.compile(r'^- \[ \] T(\d{3}) (\[P\] )?(\[US\d+\] )?(.+)$')
ids=[]; bad=[]
for i,l in enumerate(open(p).read().splitlines(),1):
    if l.startswith('- [ ]'):
        m=pat.match(l)
        (ids.append(int(m.group(1))) if m else bad.append((i,l)))
print('tasks:',len(ids),'| bad:',len(bad),'| gaps:',[n for n in range(1,max(ids)+1) if n not in ids])
EOF
```

> Si `pnpm` n'est pas dans le `PATH`, préfixer les commandes par
> `PATH="$HOME/.local/bin:$PATH"`. PostgreSQL local écoute sur **5433**
> (`POSTGRES_PORT=5433`) car `postgresql_db` occupe 5432.

---

## 8. Points d'attention pour la reprise

- **I1 est résolu** : ne pas réintroduire `max_attempts ≥ 1` — la contrainte est `= 1` en v1 (FR-065).
- `.specify/extensions.yml` est absent : ne pas s'attendre à des hooks automatiques ; les rapports doivent le mentionner.
- Pas de dépôt **distant** : le dépôt local existe, mais T280 (protection de `main`) ne peut être appliqué qu'après création du remote.
- Architecture de fichiers à respecter : `apps/web`, `apps/api`, `services/runner`, `services/assets`, `infra/`, `docs/` — **sans `packages/`** (voir `versioning.md`).
- `plan.md` doit conserver l'ordre des titres du gabarit ; les artefacts sont référencés par chemins relatifs.
- La spec mélange prose FR et FR/SC en anglais : décision de style (finding T1) non tranchée, sans impact d'exécution.
- Les 280 tâches sont suivies dans `tasks.md` (**101 cochées**, 179 restantes).
- **Propriété du score** : seul `ScoringService` calcule ; le runner renvoie des mesures brutes. Aucun test réussi ⇒ score `0` (les golden tests le figent).
- **Fin de vie Socket.IO** : ne pas quitter les clients Redis de l'adaptateur dans `onModuleDestroy` (Nest ferme Socket.IO ensuite) — utiliser `onApplicationShutdown`.
- **Suppression de compte** : `submissions.user_id` est `NOT NULL` ; l'anonymat est assuré par le tombeau pseudonyme à J+30, pas par un `UPDATE ... NULL`.
- **Préfixe API** : `/api/v1` partout, y compris le cookie `refresh_token` (`Path=/api/v1/auth`).
