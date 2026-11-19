# Contrat de job — Runner d'exécution

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13
**Transport** : file BullMQ `submissions` sur Redis 7 ; file `submissions-dlq` pour les échecs
d'infrastructure. Le runner est le **seul** composant autorisé à exécuter du code utilisateur
(principe I de la constitution).

## 1. Cycle de vie

```text
API ──(enqueue)──> queue:submissions ──> runner ──(result)──> queue:submissions-results
                                              │                      │
                                              └── échec infra ───────┴──> queue:submissions-dlq
```

1. L'API valide la requête, crée `submissions` avec `status = pending`, écrit le job, répond `202`.
2. Le runner passe `status = running` (mise à jour atomique conditionnelle).
3. Le runner exécute 5 fois, calcule la médiane, écrit le verdict et publie `submission.verdict`.
4. L'API met à jour `best_scores`, le ZSET de classement et le ledger dans **une** transaction, puis
   émet l'événement temps réel.

## 2. Charge utile du job

```jsonc
{
  "jobId": "018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01",   // = submissionId, clé d'idempotence
  "submissionId": "018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01",
  "challengeId": "uuid",
  "challengeVersionId": "uuid",
  "language": "python",                              // python | javascript
  "code": "def solve(...):\n    ...",
  "limits": {
    "wallTimeMs": 10000,
    "cpuTimeMs": 5000,
    "memoryMb": 512,
    "pidsMax": 64,
    "outputBytes": 1048576
  },
  "testsRef": {
    "ciphertextKey": "s3://codequest-secrets/challenges/<versionId>/tests.enc",
    "keyId": "k2026-11",
    "sha256": "…"
  },
  "runs": 5,
  "mode": "score",                                   // score | validate | sample
  "context": {
    "subjectType": "player",
    "subjectId": "uuid",
    "eventId": null,
    "isEventAttempt": false
  },
  "enqueuedAt": "2026-11-13T09:59:58.120Z"
}
```

Contraintes : `jobId == submissionId` (BullMQ déduplique), `code` borné à 128 Kio, `testsRef` pointe
un objet chiffré AES-256-GCM que **seul** le runner déchiffre (FR-029, FR-110). Le job ne contient
jamais les tests en clair ni la solution de référence.

## 3. Résultat

```jsonc
{
  "submissionId": "uuid",
  "status": "passed",                  // passed | failed | error | timeout | rejected
  "cpuTimesMs": [409, 412, 418, 405, 511],
  "cpuTimeMedianMs": 412,
  "cpuTimeStdDevMs": 41.2,
  "testsPassed": 19,
  "testsTotal": 20,
  "verdictReason": "Test caché 7 : sortie incorrecte",
  "failure": null,
  "sandbox": {
    "runtime": "gvisor",
    "image": "codequest/py312-runner:1.4.0",
    "exitCode": 0,
    "oomKilled": false,
    "seccompViolations": 0,
    "networkAttempts": 0
  },
  "measuredAt": "2026-11-13T10:00:06.880Z",
  "runnerId": "runner-3"
}
```

En cas d'échec d'infrastructure (image indisponible, hôte saturé, MinIO injoignable), le résultat
n'est **pas** un verdict : le job part en DLQ avec `failure.kind = "infrastructure"` et l'API remet la
soumission en `pending` (une seule requeue automatique, puis `error` visible par le joueur).

| `status` | Signification |
|---|---|
| `passed` | Tous les tests passent dans les limites |
| `failed` | Mauvaise réponse ou test échoué |
| `error` | Exception non gérée dans le code joueur |
| `timeout` | Dépassement du temps CPU ou mural |
| `rejected` | Tentative d'évasion, binaire interdit, output hors limites, réseau |

## 4. Mesure du temps CPU (principe III)

- Lecture de `cpu.stat → usage_usec` du cgroup v2 du conteneur **avant** et **après** chaque run ; la
  valeur retenue est le delta, arrondi à la milliseconde.
- 5 runs séquentiels ; le score utilise la **médiane**. L'écart-type est journalisé et un écart
  supérieur à 20 % de la médiane déclenche un run supplémentaire de confirmation (plafond 7 runs).
- Seuils par version de défi : `t_opt_ms` (score de performance maximal) et `t_max_ms` (au-delà,
  `timeout`). Ils sont recalibrés à la validation du défi par `mode = "validate"`.
- Tolérance de mesure : ±5 % (FR-032) ; les médianes situées dans cette bande sont traitées comme
  équivalentes par l'API, qui applique alors le départage par soumission la plus ancienne (FR-048).

### Composants renvoyés et propriété du calcul

Le runner renvoie uniquement les **mesures brutes** : `testsPassed`, `testsTotal`, `cpuTimeMedianMs`,
`cpuTimesMs`, `cpuTimeStdDevMs`. Il ne calcule **aucun score**.

**Le calcul du score appartient à l'API** (`apps/api/src/modules/scoring/scoring.service.ts`), seule
à disposer de `base_points`, `perf_max`, `t_opt_ms` et `t_max_ms` (portés par la version de défi en
base). Elle applique :

```text
perf_ratio = clamp((t_max - t_median) / (t_max - t_opt), 0, 1)
score      = base_points * (tests_passed / tests_total) + perf_max * perf_ratio
```

puis valide la borne `0 ≤ score ≤ base_points + perf_max` avant persistance. Cette unicité de
responsabilité garantit qu'une seule implémentation de la formule existe et que les golden tests
couvrent effectivement le code de production (principe III).

## 5. Isolation du bac à sable

| Mesure | Valeur |
|---|---|
| Runtime | gVisor `runsc` |
| Réseau | `--network=none` |
| Système de fichiers | racine en lecture seule ; `tmpfs` `/tmp` de 64 Mio ; répertoire de travail jetable |
| Utilisateur | UID/GID non privilégié (10001), `no-new-privileges` |
| Capacités | `--cap-drop=ALL` |
| Seccomp | profil `infra/seccomp/runner.json` (liste blanche) |
| cgroups v2 | `cpu.max`, `memory.max`, `pids.max`, `io.max` |
| Sortie | stdout/stderr tronqués à 1 Mio, jamais renvoyés bruts au joueur |
| Durée de vie | conteneur supprimé immédiatement après le run ; aucun volume partagé |
| Images | `codequest/py312-runner` et `codequest/node20-runner`, épinglées par digest |

Toute tentative d'ouverture de socket, de montage, de `ptrace`, ou tout binaire absent de la liste
blanche produit `status = rejected` avec `seccompViolations > 0` et une entrée d'audit (FR-036).

## 6. Concurrence, reprise et priorités

- Concurrence par hôte : `RUNNER_CONCURRENCY` (défaut 4), une exécution mesure un cœur à la fois.
- Priorité BullMQ : soumissions d'event (`priority: 1`), boss (`2`), standard (`3`), validation
  d'auteur (`4`, batch hors heures de pointe).
- `attempts: 1` pour les échecs de code ; **seuls** les échecs d'infrastructure sont requeue avec un
  backoff exponentiel (3 essais max) avant la DLQ.
- Idempotence : si `submissions.status` n'est plus `pending`/`running` à la réception, le job est
  acquitté sans réexécution (protection contre les doublons de livraison Redis).
- Un job en attente depuis plus de 10 s en mode `score` déclenche une alerte (SC-013) ; au-delà de
  60 s, il est promu en tête de file.

## 7. Observabilité du runner

Métriques Prometheus exposées sur `:9464` : `runner_jobs_active`, `runner_jobs_total{status}`,
`runner_job_duration_seconds` (histogramme), `runner_cpu_ms` (histogramme),
`runner_sandbox_violations_total{kind}`, `runner_queue_depth`. Logs JSON avec `submissionId`,
`challengeVersionId`, `runnerId` ; jamais le code source ni la sortie des tests.

## 8. Conformité

| Exigence | Couverture |
|---|---|
| FR-027 exécution isolée, éphémère et bornée | §5 |
| FR-028 tests cachés et solutions jamais envoyés au client | §2 (`testsRef` chiffré), §3 (`verdictReason` filtré) |
| FR-029 validation à 100 % des tests (mesures transmises) | §3 (`testsPassed`, `testsTotal`) |
| FR-031 temps CPU, médiane de 5 exécutions | §4 |
| FR-032 tolérance ±5 % | §4 |
| FR-035 enregistrement complet de la soumission | §3 |
| FR-036 détection d'abus | §5, §7 |
| FR-110 tests et solutions chiffrés au repos | §2 (`testsRef`, `keyId`, déchiffrement côté runner uniquement) |
| Principe I de la constitution — aucun code utilisateur hors runner | §1 |
