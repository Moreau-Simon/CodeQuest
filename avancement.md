# Avancement — Session Spec Kit / CodeQuest

**Date de session** : 18–19 novembre 2026
**Feature** : `001-codequest-platform` (spécification couvrant toute la plateforme, 5 phases / 17 histoires)
**Statut global** : workflow Spec Kit terminé (`analyze` inclus). **Implémentation en cours** : Phase 0, Phase 1, Phase 2, **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**, **US4 (Phase 6)**, **US5 (Phase 7)**, **US6 (Phase 8)**, **US7 (Phase 9)**, **US8 (Phase 10)** et **US9 (Phase 11)** terminées et vérifiées. Plateforme opérationnelle en environnement local (`pnpm dev` sur `http://localhost:5173`). Suite des phases 12 → 20 restante (T175–T278).

**Dernière mise à jour** : 25 novembre 2026 — **Phase 11 / US9 complète livrée en TDD** : tests d'abord (T163–T165 : essai unique, frontières `ends_at`/fuseau IANA, contrat `/events/*`), puis schéma Prisma `Event`/`EventChallenge`/`EventParticipant` + migration `20261125120000_us9_events` (CHECK `ends_at > starts_at`, `max_attempts = 1`), module `events` (inscription, démarrage explicite verrouillé, job BullMQ d'expiration, résultats/corrigés après clôture), priorité de file `event: 1` appliquée aux soumissions, et bloc web (pages `/events`, `/events/:eventId`, `/events/:eventId/results`, horloge serveur `serverNow`, confirmation explicite, corrigés débloqués) → **175/280 tâches**. Branche dédiée `phase-11-us9` depuis `main` (`dd5b6cd`), livrée via PR #10. Vérifications locales 25 nov. : `pnpm lint` ✅, `pnpm typecheck` ✅, `pnpm test` ✅ (**124 tests API + 61 tests web + 9 tests runner**), `pnpm build` ✅, `prisma generate` ✅, OpenAPI parse OK (**53 chemins / 37 schémas**). Suites Testcontainers/E2E à valider en CI (Docker et navigateurs absents localement). PR #9 (correctifs E2E/API) fusionnée juste avant sur `main` (`dd5b6cd`, 8/8 checks verts, approbation de `Moreau-Simon`).

**Mise à jour précédente** : 20 novembre 2026 — **Phase 10 / US8 complète livrée en TDD** : suite du bloc API (T151, T158–T160) avec persistance Yjs en PostgreSQL (`CollaborativeDocument`), conservation des scores acquis au départ d'un membre (FR-060), score de contribution `round((lignes conservées + 10×réussites + 2×assistance) × 0.5)` (FR-059), handlers `doc.update` / `doc.awareness` avec contrôle d'appartenance, et bloc web (T152, T161–T162) avec pages `/teams` et `/teams/:teamId`, hook `useCollaborativeDoc`, binding Monaco chargé à la demande et E2E deux onglets → **163/280 tâches**. Branche dédiée `phase-10-us8-collab` depuis `main` (`f7a0fd5`), livrée via PR #7 puis corrigée via PR #8 (toutes deux fusionnées, CI 8/8 verte, `main` aligné sur `7c6bc17`). Vérifications locales 20 nov. : `pnpm lint` ✅, `pnpm typecheck` ✅, **124 tests API + 58 tests web + 9 tests runner verts**, `pnpm build` ✅ (bundle initial ramené à 450 kB par chargement différé de `y-monaco`), `prisma generate/validate` ✅, OpenAPI parse OK (**51 chemins / 33 schémas**). Suites Testcontainers/E2E Playwright validées en CI (8/8 jobs verts ; Docker et navigateurs absents localement).

**Mise à jour précédente** : 20 novembre 2026 — **Phase 10 / US8 (bloc cœur API) livrée en TDD** : tests d'intégration `teams.spec.ts` (T149) et `official-submission.spec.ts` (T150) écrits avant l'implémentation ; schéma Prisma `Team`/`TeamMember`/`TeamInvitation`/`TeamOfficialSubmission` + migration `20261120120000_us8_teams` (T153/T154), module `teams` (T155/T156), désignation officielle avec miroir `is_official` et classement d'équipe recalculé (T157), arbitrages **D4** et convention ZSET consignés ci-dessous → **156/280 tâches**. Branche dédiée `phase-10-us8` depuis `main` (`a8545e9`). Vérifications locales 20 nov. : lint/typecheck API ✅, **124 tests unitaires API verts**, build ✅, Prisma `generate` ✅, OpenAPI parse OK (**50 chemins / 32 schémas**). Suites Testcontainers (T149/T150) à valider en CI (Docker absent localement).

**Mise à jour antérieure** : 19 novembre 2026 — CI totale verte puis **fusionnée sur `main` (PR #2, `a32b3a7`)**. Clarification **A5 tranchée** (option recommandée) et consignée dans `spec.md`. **Phase 9 / US7 livrée en TDD** (T139–T148) : score de résolution, instances de décryptage par graine, essai explicite unique, page web de débogage et quickstart mis à jour → **149/280 tâches**. Branche dédiée `phase-9-us7`, **PR #3 fusionnée sur `main` (`36ab070`)** après une CI totale verte (8/8 jobs) ; premier échec CI diagnostiqué et corrigé (incident #10 : injection de `fetch` dans `InstanceService`). Vérifications 19 nov. : typecheck/lint API + web ✅, **124 tests unitaires API verts** (dont 1 test de non-régression DI), **55 tests web verts** (19 fichiers), **6 tests Python verts** + ruff ✅, OpenAPI parse OK (48 chemins / 28 schémas).

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
| Dépôt git | Initialisé ; commits Conventional Commits ; remote `origin` = `https://github.com/Moreau-Simon/CodeQuest` (T280 : ruleset distant actif sur `main` — suppression, non-fast-forward, 1 approbation ; CODEOWNERS et checks requis à finaliser) |
| OS / shell | macOS (darwin), zsh |

---

## 3. Artefacts produits (tous sous `specs/001-codequest-platform/`)

| Fichier | Lignes | Contenu |
|---|---|---|
| `.specify/memory/constitution.md` | 197 | **v1.0.0**, ratifiée le 2026-11-13, 5 principes |
| `spec.md` | 944 | 17 histoires (P1–P5), **118 FR**, **22 SC**, 21 entités clés, cas limites, hypothèses, **6 clarifications** (dont A5, 19 nov.) |
| `plan.md` | 194 | Technical Context, Constitution Check (avant + après conception), structure monorepo, Complexity Tracking |
| `research.md` | 259 | Décisions **R1–R20** + table des constantes d'équilibrage (courbe XP ajoutée en Phase 8) |
| `data-model.md` | 367 | **45 tables**, 15 enums, transitions d'état, règles d'intégrité, rétention |
| `tasks.md` | 768 | **280 tâches** (T001–T280), 20 phases + Phase 0, 143 marquées `[P]` ; **163 cochées** |
| `checklists/requirements.md` | — | **16/16** |
| `contracts/openapi.yaml` | ~1250 | Validé : parse OK, **51 chemins** (dont `/teams/*`, `/teams/{id}/captain`, `/teams/{id}/official-submission/{challengeId}`, `/teams/{id}/contributions`), **33 schémas** (dont `ContributionScore`), `$ref` tous résolus |
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

### Clarifications intégrées (6)

1. Score d'équipe = **soumission officielle unique** désignée par le capitaine (aucune agrégation).
2. Le chrono démarre au **démarrage explicite d'essai**.
3. Compte non confirmé = **lecture seule publique**.
4. Battle royale = 1 élimination/manche jusqu'à 50 restants, puis 10 % arrondis au supérieur.
5. Indices achetables = défis **exploratoires uniquement, en solo**, jamais sorting/event/boss.
6. **(A5, 19 nov. 2026)** Score de résolution : chrono `start` → verdict `passed` (ou `expiredAt` en cas d'abandon), plafonné à `t_max_ms` ; bonus temps conditionné au respect de la limite de lignes modifiées, pénalités de 2 %/ligne excédentaire et 10 %/indice (max 50 % chacune), **une seule tentative en v1**.

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
| Tâches cochées | **175/280** (Phase 0–2 + US1 → US9 complète) |
| Liens relatifs cassés | 0 |
| `openapi.yaml` | parse OK, **53 chemins / 37 schémas** (ajout US9 : `/events/{id}/results`, `/events/{id}/challenges/{challengeId}/solution`, `EventParticipation`, `EventAttempt`, `EventResults`, `EventSolution`, `serverNow`, `eventId`) |

### Findings ouverts (à traiter)

| ID | Sévérité | Résumé | Emplacements |
|---|---|---|---|
| ~~A5~~ | ~~HIGH~~ | **Résolu le 19 nov. 2026** (option recommandée) — voir clarification #6 et `spec.md` § « Session 2026-11-19 » | `spec.md:634-636` (FR-039) |
| ~~D4~~ | ~~MEDIUM~~ | **Tranchée le 20 nov. 2026** : `TeamOfficialSubmission` est la source de vérité de la désignation ; `Submission.isOfficial` est un miroir maintenu dans la même transaction (désignation, remplacement, révocation). Côté lecture temps réel, l'événement `submission.verdict` continue d'exposer le miroir. Voir le journal US8. | `src/modules/teams/official-submission.service.ts`, `data-model.md:174-181` |
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
| Phase 0 — Gouvernance | T279 | ✅ fait (T280 partiel : ruleset distant actif — 1 approbation ; CODEOWNERS et checks requis à finaliser) |
| Phase 1 — Setup | T001–T018 | ✅ fait et vérifié (lint, typecheck, tests, build) |
| Phase 2 — Foundational | T019–T044 | ✅ fait et vérifié |
| Phase 3 — US1 | T045–T066 | ✅ fait et vérifié |
| Phase 4 — US2 | T067–T090 | ✅ fait et vérifié |
| Phase 5 — US3 | T091–T100 | ✅ fait et vérifié |
| Phase 6 — US4 | T101–T116 | ✅ fait et vérifié |
| Phase 7 — US5 | T117–T128 | ✅ fait et vérifié |
| Phase 8 — US6 | T129–T138 | ✅ fait et vérifié (CI verte, fusionnée en PR #2) |
| Phase 9 — US7 | T139–T148 | ✅ faits : score A5, instances par graine, migration Prisma, essai unique, page web, quickstart |
| Phase 10 — US8 (bloc API) | T149, T150, T153–T157 | ✅ faits et vérifiés : équipes/invitations/capitainerie, soumission officielle unique, classement d'équipe recalculé, OpenAPI 50 chemins / 32 schémas — PR #5 fusionnée (CI 8/8 verte, `a95ac6f`) |
| Phase 10 — US8 (reste) | T151, T152, T158–T162 | ✅ faits et vérifiés : Yjs, contribution, conservation détaillée, pages web et E2E collaboratif — PR #7 puis #8 fusionnées (CI 8/8 verte, `7c6bc17`) |
| Phase 11 — US9 | T163–T174 | ✅ faits et vérifiés : essai unique confirmé puis consommé, expiration sans pause, fenêtre serveur/IANA, classement et corrigés après clôture, priorité file `event: 1`, pages web dédiées — PR #10 (branche `phase-11-us9`) |
| Phases 12 → 20 | T175–T278 | ⏳ à faire |

**175/280 tâches cochées.** Dernières vérifications (25 nov. 2026) :
- `pnpm lint` ✅, `pnpm typecheck` ✅, `pnpm test` ✅ (**124 tests API / 23 suites + 61 tests web + 9 tests runner**), `pnpm build` ✅, `prisma generate` ✅, parse OpenAPI ✅ (53 chemins / 37 schémas), `pnpm --filter @codequest/web generate:types` ✅.

Vérifications passées (19 nov. 2026) :
- `pnpm lint` : ✅ **vert** (3/3 packages). Le `.eslintrc.cjs` a été rapatrié dans la racine du dépôt (il était auparavant dans `Projet-delpech/`, hors du checkout CI) : ESLint résout désormais les plugins sans contournement.
- `pnpm typecheck` (3 packages : 0 erreur) ; `pnpm --filter @codequest/api typecheck` + `lint` ✅.
- `pnpm --filter @codequest/api test` (**123 tests**, 22 suites dont `debug-scoring.spec.ts` (15), `xp.spec.ts`, `aes-gcm-di.spec.ts` et le contrat des schémas US6).
- `pnpm --filter @codequest/web test` (**55 tests**, 19 fichiers dont `debug-diff.test.ts` (4) et `debug-challenge.test.tsx` (1), `lessons-page.test.tsx`, `lesson-page.test.tsx`).
- `pnpm --filter @codequest/runner test` (**9 tests**, 2 suites — 8 initiaux + 1 test de non-régression cgroup ajouté après échec CI).
- `pnpm build` (3 packages compilés sans erreur : API NestJS, web Vite, runner).
- `pnpm --filter @codequest/api test:integration` (intégrations déblocage et audit validées en Phase 7).
- `pnpm --filter @codequest/api test:e2e` (non-fuite des tests cachés SC-007).
- ⚠️ Suites Testcontainers US6 (`test/integration/lessons.spec.ts`, `test/contract/lessons.contract.spec.ts`) : écrites mais **non exécutables localement** (daemon Docker absent : `Cannot connect to the Docker daemon`). Désormais câblées dans le job `integration-tests` de la CI (à confirmer au premier `push`/`pull_request`).
- Déploiement Prisma et seed local vérifiés sur PostgreSQL.
- Démarrage parallèle local `pnpm dev` opérationnel : Web (Vite `:5173`), API (NestJS `:3000`), Runner (BullMQ `:6379`).

### CI — `.github/workflows/ci.yml` (mise à jour 18 nov. 2026)

| Job | Portées | Détails |
|---|---|---|
| `node-checks` | lint, typecheck, tests unitaires, build | `pnpm lint` fonctionne en checkout propre grâce au `.eslintrc.cjs` racine ; `pnpm test` inclut `xp.spec.ts` (8), `aes-gcm-di.spec.ts` et la validation des schémas US6 |
| `integration-tests` | intégration + contrat + E2E API | `pnpm test:integration` (regex `test/(integration|contract)/.*\.spec\.ts$` → suites US1–US6, dont `lessons.spec.ts` et `lessons.contract.spec.ts`) puis `pnpm --filter @codequest/api test:e2e` (non-fuite SC-007). Docker natif de `ubuntu-latest` requis par Testcontainers |
| `python-assets` | ruff + pytest | service Python 3.12 (`uv`) |
| `web-e2e` | Playwright Chromium + axe-core | `--project=chromium-desktop` (T278 : extension aux 4 navigateurs à faire) |
| `docker-builds` | 4 images (api, web, runner, assets) | Buildx, `push: false`, matrix `fail-fast: false` |

Déclencheurs : `push` et `pull_request` sur `main`, plus `workflow_dispatch` ; `concurrency` avec annulation des exécutions redondantes ; `permissions: contents: read`.

**Incidents CI du 19 nov. 2026 (intégration vérifiée verte en CI ; `docker-builds` en attente)** :

1. **`pnpm test` — runner (résolu, voir ci-dessous)**.
2. **`web-e2e` — `e2e/auth.spec.ts` (résolu)** : le mock Playwright de `GET /me/sessions` était statique et renvoyait toujours les deux sessions après la révocation, alors que l'UI invalide bien la query et refetch. Le mock est désormais **stateful** (retrait de la session sur `DELETE`), comme le test unitaire `SessionsPage.test.tsx`. Vérifié localement : 1 test vert sur un preview CodeQuest.
3. **`docker-builds` (diagnostic en cours)** : `pnpm install --frozen-lockfile --filter @codequest/api...` échoue sur `node:20-alpine`. Durcissement appliqué aux 3 Dockerfiles Node : copie de **tous les manifests du workspace** (root + api + web + runner) pour la résolution du graphe, ajout de `python3 make g++` pour d'éventuels builds natifs sur musl, et `CI=true`. Le log détaillé de l'étape reste nécessaire si l'échec persiste.

4. **`test:integration` / contrat `challenges.contract.spec.ts` (résolu)** : `Nest can't resolve dependencies of the AesGcmService (?, String)` dès `Test.createTestingModule({ imports: [AppModule] }).compile()`. Cause : le constructeur de `AesGcmService` a deux paramètres `string` avec valeurs par défaut (`env.AES_KEY_BASE64`, `env.AES_KEY_ID`) ; `design:paramtypes` en déduit deux tokens primitifs `String` que Nest exigeait comme providers, y compris dans `AdminModule`. Correctif : `@Optional()` sur les deux paramètres (les défauts `env` s'appliquent alors) + test de non-régression `test/unit/aes-gcm-di.spec.ts` qui compile un module minimal. Vérifié : `AppModule` compile désormais sans Docker ; **108 tests API verts**.
5. **`test:integration` / `unlock.spec.ts` (résolu, vérifié en CI)** : `Foreign key constraint violated on the constraint: best_scores_submission_id_fkey` (2 tests). Les `bestScore.create` utilisaient un `submissionId: uuidv7()` sans soumission correspondante. Correctif : helper `seedPassingBestScore()` qui crée une `ChallengeVersion`, une `Submission` retenue (`status: passed`) puis le `BestScore`, sur le modèle de `test/helpers/leaderboard.ts`.
6. **`test:integration` / contrat `lessons.contract.spec.ts` (résolu, vérifié en CI)** : les POST `/lessons/{lessonId}/quiz`, `/complete` et `/positioning` renvoyaient `201` alors que `openapi.yaml` (T131) déclare `200`. Correctif : `@HttpCode(HttpStatus.OK)` sur les quatre POST du contrôleur (y compris `/start`, qui n'était pas encore couvert).

   **Nouveau log CI `pnpm test:integration` (19 nov.)** : `auth.contract`, `unlock`, `lessons`, `leaderboard` et `lessons.contract` **tous PASS**. Les `prisma:error` d'unicité dans `auth.contract` sont attendus (tests de conflits d'inscription) ; l'avertissement AWS SDK Node ≥22 est non bloquant.
7. **`test:integration` / `submissions.contract.spec.ts` (résolu)** : `beforeAll` dépassait 180 s. Cause : c'était la seule suite à importer **statiquement** `AesGcmService`, qui importe `src/config/env`. L'environnement était donc figé sur les valeurs de `test/env.ts` (`localhost:6379` / `localhost:5433`) avant que `createTestApp()` ne renseigne les URLs Testcontainers ; BullMQ (`maxRetriesPerRequest: null`) attendait indéfiniment un Redis inexistant. Correctif : import dynamique de `AesGcmService` **après** `createTestApp()`, timeout du hook porté à 300 s et pré-tirage des images `postgres:16-alpine` / `redis:7-alpine` dans la CI.
8. **`test:integration` / contrat `/challenges/{id}` (résolu)** : le 403 `CHALLENGE_LOCKED` ne contenait pas `missingPrerequisites` en clé racine. Cause : le filtre global T026 normalise toutes les erreurs en `{ code, message, details }` et droppe les clés supplémentaires. Correctif : les motifs sont désormais portés par `details.missingPrerequisites` dans `ChallengesService` (2 branches), et le test de contrat vérifie cette enveloppe.

9. **`test:e2e` / `leak.spec.ts` (résolu)** : même défaut que l'incident #7 — import **statique** de `AesGcmService` dans `test/e2e/leak.spec.ts`, donc `env` figé sur `localhost:6379`/`localhost:5433` avant `createTestApp()`. Correctif identique : import en type-only + import dynamique après `createTestApp()`, hook porté à 300 s. Le « Jest did not exit » observé était une conséquence du timeout (le `afterAll` n'avait pas pu arrêter les conteneurs). Vérification systématique effectuée : aucune autre suite Testcontainers n'importe statiquement un module chargeant `env`.

10. **`test:integration` / US7 — `InstanceService` (résolu, vérifié en CI)** : `Nest can't resolve dependencies of the InstanceService (?) ... argument Function at index [0]`, 12 suites et 65 tests en échec dès `Test.createTestingModule({ imports: [AppModule] }).compile()`. Cause analogue à l'incident #4 : le constructeur prenait `fetchImpl: FetchLike = globalThis.fetch`, or `FetchLike` est un alias de type fonction → `design:paramtypes` émet le token primitif `Function` que Nest exigeait comme provider. Correctif : jeton explicite exporté `ASSETS_FETCH` avec `@Optional() @Inject(ASSETS_FETCH)` et défaut `globalThis.fetch` (l'appel direct `new InstanceService(stubFetch)` des tests reste valide) + test de non-régression `src/modules/challenges/instance.service.spec.ts` qui compile un module minimal sans Docker. Pourquoi la vérification locale était verte : `jest.config.cjs` ignore `test/integration/` et `test/contract/`, donc `pnpm test` ne compilait jamais `AppModule` — seul `pnpm test:integration` (job CI) exerce ce chemin. Vérifié localement : `AppModule` compile, erreur DI remplacée par l'absence de Docker, lint/typecheck/**124 tests API**/build verts. En CI : run `44560691724` **8/8 jobs verts**, PR #3 fusionnée (`36ab070`).

**Étape CI `test:e2e` (SC-007)** : le premier log affiché ne montrait que l'avertissement AWS SDK (non bloquant), mais le log complet révélait l'échec du hook de `leak.spec.ts` (incident #9), désormais corrigé. À re-vérifier en CI.

**Incident CI du 19 nov. 2026 (résolu) — premier échec sur `pnpm test`** : `services/runner/test/escape.test.ts` (`ne trouve pas de cgroup pour un conteneur inexistant`) renvoyait `154943000` au lieu de `null` sur `ubuntu-latest`. Cause : `readCpuUsageUsec()` retombait sur `/sys/fs/cgroup/cpu.stat`, cgroup **de l'hôte/du runner**, absent de macOS (d'où un test vert en local) mais présent en CI — avec un risque réel de mesurer le CPU de la machine au lieu du code soumis (principe III). Correctif : suppression de ce fallback, ajout d'un paramètre `cgroupRoot` injectable et d'un test déterministe qui place un `cpu.stat` hostile à la racine temporaire et vérifie qu'il est ignoré au profit de `docker/<id>/cpu.stat`. `pnpm test` complet revérifié : **108 + 50 + 9 tests verts**.

### Journal de la session du 20 novembre 2026

| Étape | Résultat |
|---|---|
| Transition | Branche `phase-10-us8` créée depuis `main` (`a8545e9`, PR #4 fusionnée) ; exploration exhaustive du existant (Prisma, classements, temps réel, tests, web, contrats) avant toute modification. |
| Phase 10 / US8 — tests d'abord | `test/helpers/teams.ts` + `test/integration/teams.spec.ts` (T149 : création, nom/tag uniques, invitation nominative et par lien, unicité d'engagement, limite 5, transfert de capitainerie au départ puis explicite) et `test/integration/official-submission.spec.ts` (T150 : refus au non-capitaine, aucune agrégation, dernier désigné gagne, révocation, conservation après départ) écrits **avant** l'implémentation (principe IV). |
| D4 — arbitrage | `TeamOfficialSubmission` est la **source de vérité** de la désignation officielle (UNIQUE `(team_id, challenge_id)`) ; `Submission.isOfficial` n'est qu'un **miroir** écrit/effacé dans la même transaction Prisma lors de la désignation, du remplacement et de la révocation. Le verdict temps réel continue d'exposer `is_official` sans changer de contrat. |
| Convention ZSET — arbitrage | `data-model.md`/`tasks.md` parlaient du ZSET `team:<id>` ; dans le code, `team:<teamId>` est une **room Socket.IO** et la clé Redis réelle est `lb:team:<teamId>:player` (classement interne des joueurs de l'équipe, avec agrégation). Le classement **d'équipe** est `lb:global:<GLOBAL_SCOPE_ID>:team` (ainsi que les portées theme/season), lu par `GET /leaderboards/teams`. T157 utilise donc `LeaderboardService.recordTeamScore()` avec `subjectType: 'team'`, sans toucher au classement interne. |
| Atomicité Prisma/Redis | Le recalcul de `best_scores(subject_type='team')` est **transactionnel** avec l'upsert de désignation et le miroir `is_official`. La mise à jour du ZSET reste **après commit**, comme `recordRetainedScore()` : Redis et PostgreSQL ne peuvent pas partager une transaction ; la reconstruction périodique (`rebuildAll`, `verifyIdentity`) garantit SC-009. `BestScore.submissionId` perd son unicité (une soumission peut être meilleur score individuel **et** soumission officielle). |
| Schéma et migration | Migration `20261120120000_us8_teams` : 4 tables, enum `team_member_role`, CHECK longueurs 3–40 / 2–6, index partiel `UNIQUE (user_id) WHERE left_at IS NULL` (SQL brut, non exprimable en Prisma), FK compatibles avec l'anonymisation FR-014. Modèles et relations Prisma mis à jour, client régénéré. |
| Module API | `TeamsModule` câblé dans `AppModule` : `TeamsService` (création, invitations SHA-256, adhésion verrouillée avec limite configurable `team.max_size`, départ, transfert), `CaptaincyService` (départ/FR-014 ; la suppression de compte reste gérée en SQL par `account-deletion.service.ts`), `OfficialSubmissionService`, `TeamsController` (8 routes). Exceptions métier 400/403/404/409 avec codes `TEAM_FULL`, `ALREADY_IN_TEAM`, `NOT_CAPTAIN`… |
| Contrat | OpenAPI enrichi : routes `/teams/{id}/captain` et `DELETE /teams/{id}/official-submission/{challengeId}`, schémas `Team`, `TeamMember`, `TeamInvitation`, `TeamOfficialSubmission`, champs `teamId`/`isOfficial` sur `Submission` ; 50 chemins / 32 schémas. Types web régénérés. |
| Vérifications locales | lint/typecheck/tests unitaires (124)/build API ✅ ; Prisma `generate` ✅ ; suites Testcontainers T149/T150 non exécutables localement (Docker indisponible) → validation en CI. |
| Correctifs de statuts HTTP | 1ᵉʳ run CI (`44740359673`) : 4 échecs d'intégration, uniquement des statuts (`Expected: 200`, `Received: 201`). Correctifs : `@HttpCode(200)` sur `POST /teams/:id/official-submission` (upsert, cohérent avec l'OpenAPI) et attente `201` sur `POST /teams/:id/invitations` (défaut NestJS, cohérent avec l'OpenAPI). Commit `8bdc5b1`. |
| CI et fusion PR #5 | 2ᵉ run (`44741390340`) sur `8bdc5b1` : **8/8 jobs verts** (dont `API integration, contract and E2E tests` avec T149/T150). Ruleset `main` (= 1 review approbatrice) : review demandée puis obtenue de `Moreau-Simon` ; fusion via API GitHub en commit de merge **`a95ac6f`**. `origin/main` aligné sur `a95ac6f`. |

### Suite de la session du 20 novembre 2026 — bloc collaboratif US8

| Étape | Résultat |
|---|---|
| Journal et fusion PR #6 | Commit `3a6c69d` (mise à jour du journal de fusion) puis fusion via API GitHub en commit de merge **`f7a0fd5`**. `main` local et `origin/main` alignés. |
| Branche et tests d'abord | Branche `phase-10-us8-collab` créée depuis `f7a0fd5`. `test/integration/yjs.spec.ts` (T151 : convergence de deux clients, deltas concurrents, état persisté), `test/integration/membership.spec.ts` (T158) et `test/integration/contribution.spec.ts` (T159) écrits **avant** l'implémentation (principe IV). Un test unitaire web `useCollaborativeDoc.test.tsx` couvre localement la convergence et la présence. |
| Persistance collaborative (T160) | Table `CollaborativeDocument` + enum `ContributionEventKind`, tables `ContributionEvent`/`ContributionScore`, migration `20261120160000_us8_collaboration`. `YjsProvider` applique les updates, persiste `Y.encodeStateAsUpdate` périodiquement (`YJS_FLUSH_INTERVAL_MS`, limite `YJS_MAX_DOC_BYTES`), garde l'awareness en mémoire et contrôle l'appartenance. Redis n'est pas source de vérité. |
| Temps réel et contribution | Handlers `doc.update` / `doc.awareness` dans `RealtimeGateway` (room `doc:<teamId>:<challengeId}`, validation du `docId` UUID v4, contrôle d'appartenance). `MembershipService` conserve les scores acquis au départ d'un membre (FR-060) ; `ContributionService` calcule `round((lignes conservées + 10×réussites + 2×assistance) × 0.5)` (FR-059, coefficient réduit assumé). |
| Décision — coefficient de contribution | Le score individuel est volontairement à moitié du score de résolution : la contribution est une mesure de participation, pas un classement de mérite. Formule et coefficient documentés dans le service, l'OpenAPI (`ContributionScore`) et les tests. |
| Soumission d'équipe (T158) | `POST /challenges/{id}/submissions` accepte un `teamId` optionnel, vérifie l'appartenance active (`NOT_TEAM_MEMBER`) et renseigne `Submission.teamId`. La route `GET /teams/{teamId}/contributions` est publique et alimente l'interface. |
| Interface (T161/T162) | Pages `/teams` et `/teams/:teamId` (création, invitation, adhésion, capitainerie, contributions), service `teams.ts`, hook `useCollaborativeDoc` (transport Socket.IO + updates Yjs base64 + awareness), `CodeEditor` avec `MonacoBinding` chargé à la demande. Le bundle initial reste à ~450 kB (chunk séparé ~2,6 Mo chargé seulement en mode équipe). |
| E2E T152 | `apps/web/e2e/team-collab.spec.ts` : deux onglets, stub Socket.IO et Monaco injectés par `page.addInitScript`, updates partagés via `BroadcastChannel`. Convergence dans les deux sens et affichage du curseur distant vérifiés sans backend. |
| Contrat | Nouveaux éléments OpenAPI : `teamId` sur la soumission et réponse `403 NOT_TEAM_MEMBER`, `GET /teams/{teamId}/contributions`, schéma `ContributionScore` → **51 chemins / 33 schémas**. Types web régénérés. |
| Portes locales | `pnpm lint`, `pnpm typecheck`, `pnpm test` (**124 API + 58 web + 9 runner**), `pnpm build` ✅. `prisma validate`/`generate` ✅. Suites Testcontainers et Playwright non exécutables localement (Docker et navigateurs absents) → validation en CI. |
| PR #7 fusionnée | Commit `657f89d` poussé, PR #7 ouverte, review approbatrice de `Moreau-Simon` obtenue, fusion via API GitHub en commit de merge **`32ffabf`** ; `main` local et `origin/main` alignés. |
| Incident CI PR #7 (résolu) | Le job `Web E2E (Chromium)` a échoué : le binding `MonacoBinding` n'était créé que dans `onMount`, alors que `sharedDoc` arrive après l'authentification asynchrone — l'édition collaborative ne fonctionnait donc pas en conditions réelles. Correction : création du binding dans un `useEffect` réactif à `[mounted, sharedDoc]`, exposition de `data-collab-bound` pour synchroniser l'E2E, conversion 0-based de la ligne du curseur (décalage d'une ligne), et ajout de `monaco.Selection`/`monaco.Range` au stub. E2E validé localement sur le build de production (3 exécutions consécutives). Correctif livré via PR #8. |
| Incident CI PR #8 — intégration API (résolu) | Le job `API integration, contract and E2E tests` a échoué (7 tests / 2 suites), jamais exécuté jusqu'ici sur la CI de la PR #7. **T151 convergence Yjs** : le second update était appliqué à un `Y.Doc` candidat non conservé, si bien que l'état en mémoire restait au premier delta (`"ab"` au lieu de `"XYab"`) — le provider applique désormais l'update validé au document conservé. **T151 exceptions** : `ForbiddenException({ code })` expose son code dans `error.response.code` ; les assertions utilisent maintenant `{ response: { code } }`, convention déjà suivie par `lessons.spec.ts`. **T159 e-mails** : le pseudonyme `capitaine-contribution` (22 caractères) dépassait le `@MaxLength(20)` de `RegisterDto`, l'inscription renvoyait 400 et aucun e-mail n'était mis en file ; pseudonymes raccourcis (`capitaine-contrib`, `membre-contrib`) sans modifier les assertions du score. Portes locales vertes ; convergence validée par simulation Yjs directe. **Validation CI confirmée : 8/8 jobs verts** (`44819815232`). |
| Journal et fusion PR #7 / PR #8 | PR #7 fusionnée en commit de merge **`32ffabf`** (review `Moreau-Simon`), puis correctif PR #8 fusionné en commit de merge **`7c6bc17`** (CI 8/8 verte sur `917926f`, review `Moreau-Simon`, approbation et fusion via API GitHub). `main` local et `origin/main` alignés sur `7c6bc17`. |

### Journal de la session du 19 novembre 2026

| Étape | Résultat |
|---|---|
| CI Phase 8 | Tous les jobs verts ; PR #2 fusionnée sur `main` (`a32b3a7`). Incidents #1–#9 résolus (voir § CI). |
| Clarification A5 | Option recommandée retenue : chrono `start` → verdict `passed` / `expiredAt`, plafond `t_max_ms`, bonus sous condition de lignes, pénalités indices/lignes, une seule tentative en v1. Consignée dans `spec.md` (§ « Session 2026-11-19 »). |
| Branche de travail | `phase-9-us7` créée depuis `main` (protégée). |
| Phase 9 / US7 (TDD) — bloc 1 | `debug-scoring.spec.ts` (T139, **15 tests verts**) écrit avant l'implémentation ; `DiffService` (T143, LCS normalisé) et `ResolutionScoringService` (T144, score temps + pénalités) implémentés ; providers/exports câblés. Commit `21d13d5`. |
| Phase 9 / US7 — bloc 2 | `test_determinism.py` (T141, **5 tests de déterminisme** + health) puis `instances.py` (HMAC-SHA256 + xoshiro128\*\*, endpoints `/generate` et `/verify` en temps constant) : ruff ✅, **6 tests Python verts**. Commit `33e08a7`. |
| Phase 9 / US7 — bloc 3 | Migration `20261119150000_us7_debugging_decryption` et champs Prisma (T142), modèle `ChallengeAttempt` avec unique `(challengeId, userId)` ; `InstanceService` (T145, graine HMAC vérifiée par empreinte) ; exposition sûre du code bogué et endpoint `POST /challenges/{id}/attempts` (T146) ; essai obligatoire et score A5 dans `SubmissionsService`/`VerdictConsumer` ; `debugging.spec.ts` (T140) ; OpenAPI 48 chemins / 28 schémas. Commit `c406941`. |
| Phase 9 / US7 — bloc 4 | `DebugChallengePage.tsx` (T147) : éditeur préchargé, essai explicite, compte/timer, surlignage via `debug-diff.ts`, route `/challenges/:id/debug` et lien depuis `ChallengePage` ; 5 tests Vitest. Quickstart § S2 (T148) : variantes A (sorting/CPU) et B (debugging/decryption/A5), contrôle de non-fuite (SC-007 + `debugging.spec.ts` + `test_determinism.py`), variables `ASSETS_SEED_KEY`/`ASSETS_SERVICE_URL` documentées. |
| Vérifications finales US7 | typecheck + lint API et web ✅ ; **123 tests API** (22 suites) ; **55 tests web** (19 fichiers) ; **6 tests Python** + ruff ✅ ; Prisma `validate`/`generate` ✅ ; OpenAPI parse OK. Test web `challenges.test.tsx` flaky une fois en exécution parallèle avant les changements web, passé en relance et en suite complète. |
| PR #3 — CI du 19 nov. | 1ᵉʳ run : 12 suites / 65 tests en échec dans `integration-tests` : token `Function` non résolu pour `InstanceService` (incident CI #10). Test de non-régression écrit **avant** le correctif (échec reproduit localement), puis `@Optional() @Inject(ASSETS_FETCH)`. 2ᵉ run (`44560691724`) : **8/8 jobs verts**, PR #3 fusionnée sur `main` (`36ab070`). |
| Reste à faire | T149–T278 (Phases 10 → 20) ; suites Testcontainers US7 (`debugging.spec.ts`) à valider en CI (Docker absent localement). |

### Journal de la session du 18 novembre 2026

| Étape | Résultat |
|---|---|
| Commit US4 | Enregistré dans l'historique antérieur au squash (`feat(admin): module d'administration, validation de défis et outillage dev (US4)`) |
| Phase 7 / US5 (TDD) | Tests unitaires du graphe de prérequis (T117 : DAG, cycle, 4 conditions), intégration du déblocage (T118 : 4 types de conditions), contrat OpenAPI `/challenges` (T119 : catalogue, 403 motivé) |
| Schéma & Persistance | Modèle `ChallengePrerequisite` avec contraintes CHECK (exclusivité et niveau ≥ 1), modèles `Lesson`, `LessonProgress`, `LoreChapter`, `LoreProgress`, migration `20261118180000_us5_prerequisites_lessons` |
| Résolveur de DAG | `PrerequisiteGraphService` (DFS détection de cycle direct/indirect/auto-référence, `assertAcyclic`, `canAddEdge`) |
| Évaluation dynamique | `PrerequisiteCheckService` (`evaluate`, `evaluateMany` en lot optimisé, calcul des statuts `locked`, `available`, `completed`, motifs détaillés `missingPrerequisites`) |
| Contrôleur & Service | `ChallengesService` et `ChallengesController` (filtrage multi-critères, 403 Forbidden `CHALLENGE_LOCKED`, vérification dans `requirePlayable`, déclaration des langages supportés) |
| Traçabilité d'audit | Événements d'audit des prérequis et thématiques dans `audit.events.ts` (T126) |
| Interface Web Catalogue | Création de `CatalogPage.tsx` (filtres thématique/difficulté/type/statut, badges de difficulté étoilés, tooltip informatif des prérequis au survol, désactivation propre) et tests Vitest associés (T127, T128) |
| Phase 8 / US6 (TDD) | `xp.spec.ts` (8 tests verts : paliers 0/100/250/450/700, monotonie, `maxLevel`, configuration `xp.curve`), `lessons.spec.ts` (progression, dispense, XP unique, lore, SC-010), `lessons.contract.spec.ts` (toutes les routes `/lessons/*`) |
| Module Lessons API | `quiz.ts` (banc de questions sans réponses exposées), `lessons.service.ts` (contenu, quiz, progression), `positioning.service.ts` (dispense tracée), `xp.service.ts` (XP idempotent, niveau, lore), `analytics.service.ts` (SC-010), `lessons.controller.ts`, `lessons.module.ts` |
| Câblage XP/analytics | Hook `VerdictConsumer` (XP et analytics après verdict `passed`/`failed`, erreurs isolées du verdict), compteur `lesson_first_attempt_total`, migration `20261119090000_us6_lessons_xp` (CHECK + index), seed `lessons.ts` |
| Interface Web Cours | Service `services/lessons.ts`, pages `LessonsPage.tsx` (parcours, statuts) et `LessonPage.tsx` (Markdown sûr, quiz, positionnement, completion, défi lié), routes `/lessons` et `/lessons/:lessonId`, nav `nav.lessons`, clés `lesson.*`, 5 tests Vitest |

Commits présents dans l'historique (historique local écrasé lors d'un squash) :

```
2ceb842 modification CI                     # remplace la CI simulée par une CI réelle (lint, types, tests, intégration, E2E, Docker)
9063af5 Merge pull request #1 from Moreau-Simon/feat/init-architecture
c260cd7 Initialisation du monorepo et de la CI
b974532 Initial commit
```

> Les hashes cités dans les versions précédentes de ce document (`c6b69aa`, `c12e009`,
> `8d2d742`, `d553d8e`, `f884d19`, `00b586f`) n'existent plus dans l'historique courant
> (squash). Les livraisons correspondantes (US1 → US6) sont bien présentes dans l'arbre de
> travail ; seul le commit de la Phase 8 (US6) reste à enregistrer.

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

1. **Commit de la Phase 8 (US6)** (modifications locales non commitées) :
   ```bash
   git add .
   git commit -m "feat(lessons): cours, quiz, positionnement, XP/niveaux et analytics (US6)"
   ```
2. **Vérifier les suites Testcontainers US6 en CI** : `pnpm test:integration` (regex `test/(integration|contract)/.*\.spec\.ts$`, couvre `lessons.spec.ts` et `lessons.contract.spec.ts`) et `pnpm --filter @codequest/api test:e2e` (SC-007) sont désormais câblées explicitement dans `.github/workflows/ci.yml` (job `integration-tests`). Non exécutables localement sans daemon Docker.
3. ~~**Phase 9 / US7 (T139–T148)** — Résoudre des défis de débogage et de décryptage~~ ✅ livrée le 19 nov. 2026 (score au temps de résolution, diff de lignes, instances générées par graine, page web et quickstart).
4. ~~**A5** — Définir la formule exacte et les bornes de « resolution time »~~ ✅ tranchée (option recommandée, clarification 6).
5. **D4** — Trancher l'unicité de la source de vérité pour `is_official` avant la Phase 11 (US8, T157).
6. **T280** — Appliquer `infra/github/protect-main.sh` sur le remote `origin` désormais configuré.

### Points de calibration différés (non bloquants)

- Prix des indices/potions et récompenses en Bits.
- Durée exacte d'inactivité de session.

Des valeurs par défaut existent dans `research.md`.

### Phase 8 — US6 (T129–T138) : cours, quiz, positionnement et niveaux

- **Courbe XP (T129)** : `xp-curve.ts` — paliers `base*(L-1) + growth*(L-1)*(L-2)/2` avec `base=100`,
  `growth=50`, `maxLevel=100`, lisibles dans `platform_settings` (`xp.curve`). 8 tests unitaires verts.
- **Modèles & migration (T132)** : `Lesson` / `LessonProgress` étaient créés en US5 ; la migration
  `20261119090000_us6_lessons_xp` ajoute les CHECK de statuts/score/complétion et deux index.
- **Services API (T133–T136)** : `lessons.service.ts` (contenu, quiz, progression), `positioning.service.ts`
  (dispense tracée, tentative unique), `xp.service.ts` (XP une seule fois par `(user, challenge)`,
  niveau recalculé, lore débloqué), `lessons.controller.ts` (lecture publique, écritures vérifiées).
- **Contrat & hook verdict (T131, T138)** : routes `/lessons`, `/lessons/{id}`, `/start`, `/quiz`,
  `/positioning`, `/complete`, `/metrics/first-attempt` documentées ; `VerdictConsumer` attribue l'XP
  et trace `analytics.challenge_attempt` sans jamais faire échouer la livraison du verdict.
- **Interface (T137)** : `LessonsPage.tsx` (parcours) et `LessonPage.tsx` (Markdown sûr sans HTML injecté,
  quiz, test de positionnement, completion, lien vers le défi d'application), service `services/lessons.ts`,
  routes et navigation, 5 tests Vitest verts.
- **Limite de vérification** : les suites d'intégration et de contrat US6 sont écrites mais requirent Docker
  (Testcontainers) ; elles sont câblées dans le job `integration-tests` de la CI. Typecheck, build, lint
  (config `.eslintrc.cjs` désormais dans le dépôt) et suites unitaires/front verts localement.

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
- Remote **distant configuré** (`origin` → `https://github.com/Moreau-Simon/CodeQuest`) : T280 partiel — ruleset de `main` actif (suppression, non-fast-forward, 1 approbation, vérifié lors de la fusion PR #5) ; CODEOWNERS et checks requis distants restent à configurer.
- Architecture de fichiers à respecter : `apps/web`, `apps/api`, `services/runner`, `services/assets`, `infra/`, `docs/` — **sans `packages/`** (voir `versioning.md`).
- `plan.md` doit conserver l'ordre des titres du gabarit ; les artefacts sont référencés par chemins relatifs.
- La spec mélange prose FR et FR/SC en anglais : décision de style (finding T1) non tranchée, sans impact d'exécution.
- Les 280 tâches sont suivies dans `tasks.md` (**163 cochées**, 117 restantes).
- **Propriété du score** : seul `ScoringService` calcule ; le runner renvoie des mesures brutes. Aucun test réussi ⇒ score `0` (les golden tests le figent).
- **Fin de vie Socket.IO** : ne pas quitter les clients Redis de l'adaptateur dans `onModuleDestroy` (Nest ferme Socket.IO ensuite) — utiliser `onApplicationShutdown`.
- **Suppression de compte** : `submissions.user_id` est `NOT NULL` ; l'anonymat est assuré par le tombeau pseudonyme à J+30, pas par un `UPDATE ... NULL`.
- **Préfixe API** : `/api/v1` partout, y compris le cookie `refresh_token` (`Path=/api/v1/auth`).
