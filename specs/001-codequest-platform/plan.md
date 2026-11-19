# Implementation Plan: Plateforme CodeQuest — défis informatiques et compétition

**Branch**: `001-codequest-platform` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-codequest-platform/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command; its definition describes the
execution workflow.

## Summary

CodeQuest est une plateforme web d'apprentissage et de compétition algorithmique : comptes et
sessions sécurisés, défis de programmation exécutés dans un bac à sable isolé avec score fondé sur
le temps CPU, classements quasi temps réel, équipes avec édition collaborative, événements à essai
unique, boss et points de vie, économie virtuelle, lore, chat texte/vocal et battle royale.

Approche technique retenue (issue du document de spécification v1.0 et de `PLAN_DE_REALISATION.md`) :
**monolithe modulaire NestJS** pour l'API et le temps réel, **front React/Vite/Tailwind** avec Monaco,
**deux services séparés** pour des raisons de sécurité et de charge — un **runner sandboxé** (gVisor,
cgroups v2, aucun réseau) et un **service d'assets Python** (génération par seed) — adossés à
**PostgreSQL 16**, **Redis 7** (sessions, ZSET de classement, files BullMQ, pub/sub), **MinIO**,
**LiveKit** pour la voix, le tout orchestré par **Docker Compose** et livré par **GitHub Actions**.

Le périmètre couvre les cinq phases de la feuille de route ; l'implémentation est ordonnée par
priorité (P1 → P5) et chaque phase ne démarre qu'après validation des portes de qualité.

## Technical Context

**Language/Version**: TypeScript 5.6 sur Node.js 20 LTS (API, web, runner) ; Python 3.12 (service
d'assets)

**Primary Dependencies**: NestJS 10, Prisma 6, Socket.IO 4 (+ adaptateur Redis), Yjs 13, React 18,
Vite 5, Tailwind CSS 3, Monaco Editor, Zustand, TanStack Query, BullMQ 5, Argon2id (`argon2`),
`jose` (JWT), `zod` + `class-validator` (DTO), Nodemailer, `prom-client` + `pino`, LiveKit Server SDK,
Pillow / `qrcode` / `stegano` (Python)

**Storage**: PostgreSQL 16 (source de vérité), Redis 7 (sessions, rate limiting, classements ZSET,
files BullMQ, pub/sub), MinIO (S3 : avatars, images de stéganographie, QR codes)

**Testing**: Vitest (web + unitaires API), Jest + Testcontainers (intégration PostgreSQL/Redis),
Playwright (E2E), pytest (assets), k6 (charge), axe-core (accessibilité), OWASP ZAP (sécurité),
Gitleaks (secrets), jeu de défis « golden » (non-régression du scoring)

**Target Platform**: conteneurs Linux (amd64 et arm64) ; navigateurs : deux dernières versions de
Chrome, Firefox, Safari, Edge ; PWA installable ; mobile, tablette, desktop

**Project Type**: application web (monorepo) + deux microservices (runner, assets)

**Performance Goals**: p95 < 300 ms hors soumissions ; verdict de soumission < 10 s dans 95 % des
cas ; 1 000 utilisateurs actifs simultanés ; 100 soumissions/min en pic ; 500 connexions temps réel ;
mise à jour de classement visible < 5 s

**Constraints**: exécution de code utilisateur uniquement dans le runner isolé (aucun réseau, lecture
seule, non-root, seccomp, cgroups) ; score en temps CPU, médiane de 5 exécutions, ±5 % ; WCAG 2.1 AA ;
horodatages UTC et fuseau IANA explicite par event ; secrets hors dépôt ; tests et solutions chiffrés
AES-256-GCM ; couverture métier ≥ 80 %

**Scale/Scope**: 118 exigences fonctionnelles, 22 critères de succès, 17 histoires utilisateur,
~30 agrégats persistés, 2 langages d'exécution (Python, JavaScript), 5 phases de livraison

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Porte vérifiée | Statut | Preuve / décision de conception |
|---|---|---|---|
| I. Isolation de l'exécution (NON NÉGOCIABLE) | Aucun composant hors `services/runner` n'exécute de code utilisateur ; bac à sable éphémère sans réseau, FS lecture seule, non-root, seccomp, cgroups ; tests d'évasion | **PASS** | Runner dédié consommant une file BullMQ ; conteneur par exécution, `--network=none`, `--read-only`, `--cap-drop=ALL`, user non privilégié, gVisor (`runsc`), limites cgroups v2 ; campagne d'évasion en Phase 5 |
| II. Sécurité par défaut | Argon2id, JWT 15 min + refresh opaque rotatif 30 j en cookies HttpOnly/SameSite=Lax, RBAC `deny by default`, AES-256-GCM, Gitleaks, secrets hors dépôt | **PASS** | Module `auth` + `sessions` ; guard RBAC global avec `@Public()`/`@RequirePermissions()` ; chiffrement applicatif des tests/solutions avec clé hors dépôt ; scan Gitleaks en pré-commit et CI |
| III. Mesure équitable | Temps CPU, médiane de 5 runs, ±5 %, bornes `t_opt`/`t_max` calibrées, golden tests | **PASS** | Comptabilité CPU via cgroup v2 (`cpu.stat`), 5 exécutions par soumission, clamp applicatif, tests golden dans `apps/api/test/golden` |
| IV. Tests d'abord et portes bloquantes | Tests écrits avant la logique, intégration Testcontainers, E2E Playwright, CI bloquante | **PASS** | Convention TDD par module ; `pnpm test`, `pnpm e2e`, `pnpm test:integration` en CI ; fusion interdite si lint/types/tests échouent |
| V. Modularité et MoSCoW | Frontières de monorepo, aucune fonctionnalité « Won't Have », priorisation P1 → P5 | **PASS (avec dérogation documentée)** | Modules cloisonnés par domaine, accès données via services de module ; livraison strictement séquencée par phase (voir Complexity Tracking) |

**Portes de qualité applicables à chaque incrément** : lint + typecheck + tests unitaires verts ;
tests d'intégration des transactions et du RBAC verts ; aucune régression golden ; revue par un pair ;
migration versionnée et réversible.

### Re-vérification après la conception (Phase 1)

| Principe | Vérification sur les artefacts produits | Statut |
|---|---|---|
| I. Isolation de l'exécution | `contracts/runner-job.md` §5 fixe gVisor, `--network=none`, racine lecture seule, `cap-drop=ALL`, seccomp, cgroups v2 ; aucun autre artefact ne prévoit d'exécution de code utilisateur | **PASS** |
| II. Sécurité par défaut | `contracts/openapi.yaml` déclare `cookieAuth` global et n'ouvre que les routes d'authentification ; `data-model.md` impose Argon2id, hachage des refresh tokens, unicité d'idempotence, audit et ledger append-only | **PASS** |
| III. Mesure équitable | `contracts/runner-job.md` §4 formalise la lecture `cpu.stat`, la médiane de 5 runs, le plafond à 7 runs et la formule de score bornée ; `research.md` R2 et R20 fournissent les golden tests | **PASS** |
| IV. Tests d'abord et portes bloquantes | `quickstart.md` §3 énumère les commandes de test par couche et §5 les critères de sortie ; `data-model.md` ajoute les règles d'intégrité testables ; `tasks.md` T274-T278 couvrent les parcours critiques exigés par SC-011 et câblent `pnpm e2e` en porte bloquante | **PASS** |
| V. Modularité et MoSCoW | `plan.md` découpe un module par domaine et interdit l'accès direct à la base d'un autre module ; la dérogation « une spec pour 5 phases » reste tracée ci-dessous | **PASS (dérogation documentée)** |

## Project Structure

### Documentation (this feature)

```text
specs/001-codequest-platform/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── versioning.md        # Norme de versionnage et gouvernance du dépôt (§11.2)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── openapi.yaml
│   ├── websocket-events.md
│   ├── runner-job.md
│   └── assets-service.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
projet-codequest/
├── apps/
│   ├── api/                          # NestJS : monolithe modulaire
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/             # inscription, login, refresh, reset, vérification
│   │   │   │   ├── users/            # profil, préférences, export, suppression
│   │   │   │   ├── rbac/             # rôles, permissions, guards
│   │   │   │   ├── challenges/       # catalogue, versions, prérequis, thématiques
│   │   │   │   ├── scoring/          # formule, calibrage, golden
│   │   │   │   ├── submissions/      # cycle de vie, file, verdicts
│   │   │   │   ├── leaderboards/     # ZSET Redis + reconstruction PostgreSQL
│   │   │   │   ├── lessons/          # cours, progression, XP, niveaux
│   │   │   │   ├── teams/            # équipes, membres, capitainerie
│   │   │   │   ├── events/           # fenêtres, essai unique, résultats
│   │   │   │   ├── bosses/           # phases, PV, KO, régénération
│   │   │   │   ├── economy/          # wallet, ledger, boutique
│   │   │   │   ├── content/          # lore, chapitres, progression
│   │   │   │   ├── chat/             # canaux, messages, modération
│   │   │   │   ├── battle-royale/    # rounds, éliminations, spectateurs
│   │   │   │   ├── admin/            # back-office, audit
│   │   │   │   ├── audit/            # journal append-only (transverse)
│   │   │   │   ├── notifications/    # notifications in-app et Web Push
│   │   │   │   ├── privacy/          # consentement, export RGPD
│   │   │   │   ├── anti-cheat/       # détection de similarité, revue humaine
│   │   │   │   └── health/           # liveness/readiness
│   │   │   ├── common/               # guards, interceptors, filters, crypto, clock, rate-limit
│   │   │   ├── config/               # validation d'environnement
│   │   │   ├── mail/                 # envoi d'e-mails transactionnels
│   │   │   ├── queue/                # files BullMQ
│   │   │   ├── redis/                # clients Redis et préfixage
│   │   │   ├── storage/              # client MinIO et URLs signées
│   │   │   └── realtime/             # gateway Socket.IO, rooms, auth de socket
│   │   ├── prisma/                   # schema.prisma, migrations, seed
│   │   ├── test/                     # unitaires, intégration, golden
│   │   └── Dockerfile
│   └── web/                          # React + TypeScript + Vite + Tailwind
│       ├── src/
│       │   ├── components/           # design system, Monaco, barres de PV, chat
│       │   ├── pages/                # accueil, défis, éditeur, équipes, profil, admin
│       │   ├── hooks/                # sockets, Yjs, vocal, notifications
│       │   ├── stores/               # Zustand (session, préférences, UI)
│       │   ├── services/             # client API typé, contrats générés
│       │   └── i18n/                 # textes externalisés (fr)
│       ├── e2e/                      # Playwright
│       ├── public/                   # manifest PWA, service worker
│       └── Dockerfile
├── services/
│   ├── runner/                       # consommateur BullMQ + bac à sable
│   │   ├── src/
│   │   │   ├── queue/                # consommation, retries, idempotence
│   │   │   ├── sandbox/              # gVisor, cgroups, seccomp, montage temporaire
│   │   │   └── measure/              # temps CPU, médiane, limites
│   │   ├── runtimes/                 # images minimales python:3.12, node:20
│   │   └── Dockerfile
│   └── assets/                       # service Python de génération
│       ├── generator/                # PRNG déterministe, LSB, QR altérés
│       ├── tests/                    # pytest
│       └── Dockerfile
├── infra/
│   ├── docker-compose.yml            # dev : api, web, postgres, redis, minio, livekit, mailhog, runner, assets
│   ├── docker-compose.prod.yml       # durci (secrets, réseaux segmentés)
│   ├── nginx/                        # reverse proxy, TLS, en-têtes de sécurité
│   ├── seccomp/                      # profil du runner
│   ├── prometheus/                   # scrape config
│   └── grafana/                      # tableaux de bord
├── docs/                             # spécifications, diagrammes, manuels
├── specs/                            # artefacts Spec Kit (spec, plan, tasks, contrats)
├── .github/
│   ├── workflows/                    # ci.yml, e2e.yml, security.yml, release.yml
│   └── pull_request_template.md
├── CODEOWNERS
├── CHANGELOG.md                      # généré depuis les Conventional Commits
├── commitlint.config.cjs
├── .gitignore
└── README.md
```

**Structure Decision**: monorepo unique avec espaces de travail pnpm et Turborepo, conformément à la
section 2 du plan de réalisation. `apps/api` reste un monolithe modulaire (un module par domaine, pas
d'accès direct à la base d'un autre module) ; seuls `services/runner` et `services/assets` sont
physiquement séparés, l'un pour l'isolation de sécurité, l'autre pour le coût CPU de la génération
d'images. `infra/` centralise l'orchestration et les profils de sécurité. Les contrats d'interface
sont la source de vérité partagée entre front, API, runner et assets.

### Versionnage et livraison (section 11.2 du document de spécification)

Norme complète : [versioning.md](./versioning.md). Points opposables pendant l'implémentation :

1. **Monorepo unique** compartimenté en `apps/web`, `apps/api`, `services/runner`,
   `services/assets`, `infra/`, `docs/` — **sans dossier `packages/`** (types générés depuis
   `contracts/openapi.yaml` vers `apps/web/src/services/`).
2. **Branches** : `main` protégée et toujours déployable ; travail sur `feat/...` ou `fix/...` ;
   fusion uniquement par Pull Request avec relecture d'un pair et CI verte.
3. **Livraisons** : Conventional Commits (vérifiés par `commitlint`), SemVer avec tags Git annotés
   et `CHANGELOG.md` généré automatiquement par `.github/workflows/release.yml`.
4. **Traçabilité en base** : `challenge_versions` historise énoncés, tests et seuils (scores passés
   rattachés à leur version, FR-087) ; migrations Prisma versionnées et reproductibles, additives
   d'abord (expand/contract).

Application : T279 (initialisation du dépôt), T280 (protection de `main`, PR, CODEOWNERS),
T004 (`commitlint`), T272 (release/changelog), T072/T104 (immuabilité des versions de défi),
T021 (migrations vérifiées).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Une seule spécification couvre les 5 phases MoSCoW (y compris « Could Have ») | Demande explicite de spécifier l'intégralité de la plateforme en une passe | Découper en 6 specs distinctes aurait dupliqué les entités transverses (soumission, score, ledger) et fragmenté les critères de succès ; mitigation : implémentation séquencée P1 → P5 avec portes de phase |
| Deux microservices en plus du monolithe (`runner`, `assets`) | Isolation de sécurité du code hostile et découplage d'une charge CPU non bornée | Tout ramener dans l'API violerait le principe I (le processus web ne doit jamais exécuter de code utilisateur) et exposerait la base aux exécutions |
| Maintien d'un classement dénormalisé (Redis ZSET) en plus de PostgreSQL | Lecture de classement en quelques millisecondes sous forte charge | Interroger PostgreSQL à chaque affichage ne tient pas la cible p95 < 300 ms ni les 500 connexions temps réel ; la reconstruction périodique garantit la cohérence |
