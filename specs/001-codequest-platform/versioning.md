# Versionnage et gouvernance du dépôt

**Source** : document de spécification fonctionnelle et technique, **section 11.2 (Versionnage)**
**Statut** : norme opposable pour toute l'implémentation de `001-codequest-platform`
**Références** : `plan.md` § Project Structure, FR-087, constitution principes II et V

Ce document fixe les règles de gestion du code source, des branches, des livraisons et de la
traçabilité en base. Elles s'appliquent dès la première tâche d'implémentation (T279) et jusqu'à la
mise en production.

---

## 1. Monorepo Git unique

L'ensemble de la plateforme vit dans **un seul dépôt**, compartimenté en modules autonomes :

```text
projet-codequest/
├── apps/
│   ├── api/                  # NestJS — monolithe modulaire (frontière par module)
│   └── web/                  # React + Vite + Tailwind + Monaco
├── services/
│   ├── runner/               # consommateur BullMQ + bac à sable gVisor
│   └── assets/               # service Python de génération déterministe
├── infra/                    # Docker Compose, nginx, seccomp, Prometheus, Grafana, k6
├── docs/                     # spécifications, runbooks, manuels, sécurité
├── specs/                    # artefacts Spec Kit (spec, plan, tasks, contrats…)
├── .github/
│   ├── workflows/            # ci.yml, e2e.yml, security.yml, release.yml
│   └── pull_request_template.md
├── CODEOWNERS
├── CHANGELOG.md
├── commitlint.config.cjs
├── .gitignore
└── README.md
```

Règles :

- **Pas de dossier `packages/`** : les types partagés sont générés depuis `contracts/openapi.yaml`
  vers `apps/web/src/services/` (cf. T015). Aucun paquet interne à publier.
- `apps/api` reste un **monolithe modulaire** : un module par domaine, aucun accès direct aux tables
  d'un autre module. Seuls `services/runner` et `services/assets` sont physiquement séparés
  (isolation de sécurité pour l'un, charge CPU pour l'autre).
- `infra/` centralise l'orchestration et les profils de sécurité ; aucun secret n'y est versionné
  (`.env.example` uniquement, principe II).
- Les **contrats d'interface** (`specs/001-codequest-platform/contracts/`) sont la source de vérité
  partagée entre front, API, runner et assets.
- Un seul espace de travail pnpm + Turborepo à la racine ; verrou `pnpm-lock.yaml` versionné.

**Pourquoi un monorepo** : cohérence des versions entre modules, partage des types TypeScript,
pipelines CI unifiés, revue transverse des changements de contrat.

---

## 2. Stratégie de branches

| Élément | Règle |
|---|---|
| `main` | **Protégée**, toujours stable et déployable. Aucun push direct. |
| Branches de travail | **Éphémères** : `feat/<slug>` pour une fonctionnalité, `fix/<slug>` pour un correctif, `chore/<slug>` pour l'outillage, `docs/<slug>` pour la documentation |
| Intégration | **Pull Request obligatoire** vers `main` |
| Revue | **Relecture par un pair** (au moins 1 approbation, 2 pour les changements de contrat ou de schéma) |
| CI | **Verte obligatoire** : lint, typecheck, tests unitaires, intégration, E2E, accessibilité, sécurité |
| Fusion | Squash merge uniquement, branche source supprimée après fusion |
| Conflits | Rebase sur `main` avant fusion ; pas de merge commit de synchronisation |

Les branches `feat/*` et `fix/*` référencent l'histoire ou la tâche concernée dans leur description
(ex. `feat/us9-event-single-attempt`).

---

## 3. Commits et livraisons

### Conventional Commits (obligatoire)

Format : `<type>(<scope>): <description>`

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bug |
| `refactor` | réorganisation sans changement de comportement |
| `test` | ajout ou correction de tests |
| `docs` | documentation |
| `build` / `ci` | outillage, dépendances, pipelines |
| `perf` | amélioration de performance |
| `chore` | maintenance |

`scope` = module concerné (`auth`, `scoring`, `leaderboards`, `runner`, `web`…).
Vérification par **commitlint** via le hook Husky `commit-msg` (T004) — un message non conforme est
rejeté localement, et le job CI `commitlint` rejette la PR.

### SemVer et journal des modifications

- Versionnement **SemVer** `MAJEURE.MINEURE.CORRECTIF` appliqué aux composants livrables
  (`apps/api`, `apps/web`, `services/runner`, `services/assets`).
- **Tags Git** annotés (`vX.Y.Z`) posés sur `main` uniquement, après CI verte.
- **`CHANGELOG.md` généré automatiquement** depuis les Conventional Commits par le workflow
  `.github/workflows/release.yml` (T272) ; jamais édité à la main.
- Une rupture de contrat public (OpenAPI, événements WebSocket, job runner) impose une **MAJEURE**
  et une note de migration dans `CHANGELOG.md`.

---

## 4. Traçabilité métier et base de données

### Versionnage des défis

- Les énoncés, jeux de tests et seuils de performance sont historisés dans **`challenge_versions`**
  (`data-model.md` §4), avec `UNIQUE (challenge_id, version)` et immutabilité après publication
  (T072, T104, FR-087).
- Une soumission pointe **toujours** vers la version de défi en vigueur au moment de l'exécution.
- Modifier un défi publié crée une **nouvelle version** ; les scores antérieurs restent attachés à
  leur version d'origine, donc comparables et équitables (principe III).
- Les tests et solutions de référence sont chiffrés AES-256-GCM avec `challenge_version_id` en AAD
  (FR-110) ; la rotation de clé est versionnée par `key_id`.

### Migrations de schéma

- Toute évolution PostgreSQL est **scriptée** dans `apps/api/prisma/migrations/`, jamais appliquée à
  la main ni via `prisma db push` hors développement local jetable.
- Les migrations sont **reproductibles à l'identique** sur tous les environnements
  (`prisma migrate deploy` en CI et en production).
- Les migrations sont **additives d'abord** (expand/contract) pour permettre un déploiement sans
  interruption ; une migration destructive est séparée en deux livraisons.
- La réversibilité est vérifiée sur une base de test (finding C5 : à câbler dans T021).
- Les migrations sont relues comme du code de production (2 approbations si elles touchent des
  données existantes).

---

## 5. Application pendant l'implémentation

Checklist à respecter à chaque tâche :

1. La tâche s'exécute sur une branche `feat/*` ou `fix/*`, jamais directement sur `main`.
2. Chaque commit est un Conventional Commit valide (`commitlint`).
3. La PR contient : tâche(s) Spec Kit concernée(s), référence FR/SC, preuve de test, impact contrat.
4. La CI doit être verte (dont T278 pour l'E2E et la porte accessibilité).
5. Une modification de `specs/001-codequest-platform/contracts/` déclenche une revue supplémentaire
   et, si rupture, une MAJEURE.
6. Une modification de `apps/api/prisma/schema.prisma` s'accompagne d'une migration versionnée.
7. Une modification d'un défi publié passe par `challenge_versions`, jamais par un `UPDATE` direct.

---

## 6. Conformité

| Exigence | Couverture |
|---|---|
| Section 11.2 — monorepo Git | §1, arborescence de `plan.md` |
| Section 11.2 — branches `main` protégée + `feat/`/`fix/` + PR + revue + CI | §2, T279, T280 |
| Section 11.2 — Conventional Commits + SemVer + tags + changelog | §3, T004 (commitlint), T272 (release.yml) |
| Section 11.2 — `challenge_versions` historisés | §4, T072, T104, FR-087 |
| Section 11.2 — migrations versionnées et reproductibles | §4, T021, T007 |
| Principe II — secrets hors dépôt | §1, T004 (Gitleaks), FR-111 |
| Principe V — gouvernance et modularité | §1, §2, §3 |
