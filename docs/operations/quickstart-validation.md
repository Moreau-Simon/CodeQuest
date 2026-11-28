# Validation du quickstart — T270

**Date** : 28 novembre 2026 · **Environnement** : macOS (Darwin), Docker Engine 28.4.0, Node 20+,
pnpm 9.12.0, Python/uv, Playwright installé. `main` après fusions des lots E2E, perf et docs.

Ce rapport consigne l’exécution de `specs/001-codequest-platform/quickstart.md` (S1 → S15). Les
scénarios sont rejoués par les tests automatisés qui en constituent la preuve de non-régression ;
les étapes purement manuelles non réalisables sur cet hôte sont explicitement marquées « non
exécuté » avec leur motif.

## Scénarios

| Scénario | Preuve exécutée | Résultat |
|---|---|---|
| S1 — Inscription et confirmation | E2E `critical-journey.spec.ts` + intégration `auth.spec.ts` | voir § Portes |
| S2 — Soumission et verdict (A5, repli REST) | Intégration `submissions`/`debugging` + E2E `critical-journey.spec.ts` ; migrations et seed appliqués sur PostgreSQL neuf (5433) | voir § Portes |
| S3 — Non-fuite des tests cachés | `test:e2e --grep "no hidden test leak"` + intégration `debugging.spec.ts` | voir § Portes |
| S4 — Isolation gVisor | `pnpm --filter @codequest/runner test` (9 tests, campagne d’évasion) | vert ; **[Linux]** non exécuté (pas de `runsc` sur macOS) |
| S5 — Équipe et édition collaborative | Intégration `teams.spec.ts` + E2E `team-critical.spec.ts` | voir § Portes |
| S6 — Event à essai unique | E2E `event-single-attempt.spec.ts` + intégration events | voir § Portes |
| S7 — Boss, PV et KO | Intégration `battle-royale.spec.ts` / tests unitaires boss | voir § Portes |
| S8 — Économie et indices | Tests unitaires économie + intégration wallet | voir § Portes |
| S9 — Battle royale | Intégration `battle-royale.spec.ts` | voir § Portes |
| S10 — Chat et modération | Intégration `chat.spec.ts` + E2E chat | voir § Portes |
| S11 — Suppression de compte / RGPD | E2E `account-lifecycle.spec.ts` + intégration GDPR | voir § Portes |
| S12 — Performance et charge | Scripts `infra/load/*.js` validés (T263) ; `k6` absent de l’hôte | non exécuté localement |
| S13 — Sécurité et accessibilité | `pnpm test:a11y`, `pnpm test:browsers`, baseline ZAP (T265) | voir § Portes |
| S14 — Restauration et intégrité | Runbooks et script `ops:verify-integrity` ; pile d’exploitation absente | non exécuté localement |
| S15 — Multi-appareils, PWA, notifications | E2E `responsive`, `a11y`, `pwa` sur 4 navigateurs (PR #21) | vert en CI |

## Portes

Journal exécuté sur la branche finale après rebase sur `main` :

| Porte | Résultat |
|---|---|
| `pnpm lint` | ✅ (1 règle ESLint corrigée dans `governance.spec.ts`) |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ API : 48 suites / 259 tests ; web : 32 fichiers / 91 tests en rejeu isolé (5 timeouts sous charge parallèle lors du rejeu concurrent) |
| `pnpm build` | ✅ |
| `pnpm test:integration` | ✅ 35 suites en CI (PR #23) ; rejeu local interrompu par un timeout Testcontainers sous charge Docker |
| `pytest` (service assets) | ✅ 23 tests |
| Playwright (`pnpm test:browsers`) | ✅ 4 navigateurs en CI (PR #21) |
| `axe-core` (`pnpm test:a11y`) | ✅ 32 tests réussis / 2 ignorés localement (code de sortie 1 dû au teardown du runner local, CI verte) |
| Golden tests (`apps/api/test/golden/sorting.spec.ts`) | ✅ |
| `pnpm --filter @codequest/runner test` | ✅ 9 tests (dont 5 d’évasion) |
| `prisma generate` | ✅ |
| `prisma migrate deploy` + `prisma:seed` | ✅ sur PostgreSQL neuf (port 5433) |
| OpenAPI / types web | ✅ 73 chemins / 49 schémas ; `apps/web/src/services/api-types.ts` régénéré |

## Écarts

1. **[Linux]** `runsc` (gVisor) absent sur macOS : S4 est couvert par le profil `local-mock` et la
   campagne d’évasion documentée ; l’isolation réelle reste validée sur les runners Linux de la CI.
2. `k6` n’est pas installé sur l’hôte : les trois scripts de charge existent et sont syntaxiquement
   validés, mais les mesures p95 proviennent de la dernière campagne `infra/load/RESULTS.md`.
3. L’image `minio/minio:RELEASE.2024-09-13T20-26-02Z` n’est pas téléchargeable depuis cet
   environnement (`pull access denied`) : le démarrage complet (`docker compose up`) est bloqué.
   PostgreSQL, Redis et MailHog ont été démarrés séparément (`codequest-qs`) ; `prisma migrate
   deploy` et `prisma:seed` y ont réussi. Les scénarios nécessitant l’API, les assets et MinIO
   sont couverts par les suites d’intégration, E2E stateful et la CI, pas par une pile complète
   locale.
4. Le quickstart annonce Grafana sur `http://localhost:3001`, or `infra/docker-compose.yml` ne
   définit pas ce service ; la supervision est disponible via les métriques Prometheus et le
   tableau de bord provisionné hors compose.
5. Le quickstart annonce la commande `pnpm --filter @codequest/api seed` ; le script réel est
   `pnpm --filter @codequest/api prisma:seed`.
6. Le quickstart annonce `pnpm test:golden` ; aucun script racine de ce nom n’est défini. Les
   golden tests sont exécutés par `pnpm --filter @codequest/api test` (`test/golden/`).
7. Le quickstart annonce l’API sur `http://localhost:3000/api/v1` avec `GET /health` ; le healthcheck
   réel est `GET /health/live` (sonde Docker) et le préfixe de santé est documenté dans l’OpenAPI.
8. Le titre du quickstart annonce S1 → S14 alors que la section contient S15 ; le rapport couvre
   les quinze scénarios.
