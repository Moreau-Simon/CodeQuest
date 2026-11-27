# Constitution CodeQuest

**Version** : 1.0.0 — **Date** : 28 novembre 2026 — **Statut** : conforme (une dérogation tracée).

Cette constitution est la source d’autorité pour les décisions d’architecture et de livraison.
Toute PR qui contrevient à un principe doit documenter une dérogation explicite et obtenir une
revue supplémentaire. La conformité finale est revérifiée en Phase 20 (T271).

## I. Isolation de l’exécution (NON NÉGOCIABLE)

Aucun composant hors `services/runner` n’exécute de code utilisateur. Chaque soumission est
exécutée dans un conteneur éphémère gVisor (`runsc`) : `--network=none`, racine et montage en
lecture seule, `--cap-drop=ALL`, profil seccomp, utilisateur non privilégié, limites cgroups v2.
Les quatre vecteurs d’évasion (réseau, secrets hôte, fork bomb, OOM) sont rejoués à chaque
livraison (`pnpm --filter @codequest/runner test`) et consignés dans
`docs/security/escape-campaign.md`.

## II. Sécurité par défaut

Argon2id pour les mots de passe ; JWT court (15 min) et refresh opaque rotatif (30 j) en cookies
HttpOnly/SameSite=Lax ; RBAC `deny by default` ; tests cachés et solutions chiffrés en
AES-256-GCM avec clé hors dépôt ; secrets jamais versionnés (Gitleaks en CI) ; suppression de
compte avec anonymisation des scores ; audit append-only des opérations sensibles.

## III. Mesure équitable

Le temps CPU est mesuré via `cpu.stat` du cgroup du conteneur, jamais sur l’hôte. Chaque
soumission exécute cinq runs, la médiane est retenue, les bornes `t_opt`/`t_max` sont calibrées et
les golden tests de `apps/api/test/golden` protègent la formule de score contre toute dérive.

## IV. Tests d’abord et portes bloquantes

Toute logique est précédée d’un test vu rouge. Les portes bloquantes sont `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, E2E quatre navigateurs,
`pnpm test:a11y` et la couverture métier ≥ 80 %. Aucune fusion dans `main` sans CI verte et revue
approbatrice ; les parcours critiques sont couverts par des E2E stateful (T274–T278).

## V. Modularité et MoSCoW

Un module NestJS par domaine, cloisonné : aucun accès direct à la base d’un autre module, les
échanges passent par des services exposés et des événements contractés. Le front consomme les
types générés depuis `contracts/openapi.yaml`. Aucune fonctionnalité « Won’t Have » n’est livrée ;
la priorisation P1 → P5 et la séquence par phases sont conservées.

### Portes de qualité applicables à chaque incrément

- lint, typecheck, tests unitaires et build verts ;
- intégration Testcontainers, contrats et E2E verts ;
- aucune régression golden, couverture métier ≥ 80 % ;
- migration versionnée et réversible ;
- revue par un pair (deux approbations pour `contracts/` ou `prisma/schema.prisma`) ;
- baseline de sécurité et campagne d’évasion documentées.

## Complexity Tracking

| Dérogation | Justification | Risque | Compensation |
|---|---|---|---|
| Une seule spec pour cinq phases de livraison (P1 → P5) | Évite la duplication de 118 exigences et garde une traçabilité continue des tâches | Découpage moins granulaire | `tasks.md` découpe explicitement chaque phase et chaque histoire ; checkpoints de livraison par phase |

La présente constitution remplace la table « Constitution Check » de `plan.md`, qui en reste la
preuve de conception (toutes les portes y sont `PASS`, avec la dérogation ci-dessus).
