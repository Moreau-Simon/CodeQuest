# Runbook — file bloquée (soumission)

**Date** : 28 novembre 2026 · **Périmètre** : API + runner + Redis/BullMQ.

## Symptôme

Une soumission reste `pending` au-delà de 10 secondes (SC-002), ou le job n'est jamais passé
au runner. Le verdict n'apparaît pas dans l'interface et le score n'est pas attribué.

## Diagnostic

1. Identifier la soumission et sa clé d'idempotence dans l'API (journal d'audit, `submission_id`).
2. Inspecter les files BullMQ :

```bash
redis-cli -u "$REDIS_URL" LLEN bull:submissions:wait
redis-cli -u "$REDIS_URL" LLEN bull:submissions:active
redis-cli -u "$REDIS_URL" LLEN bull:submissions-dlq:wait
```

3. Vérifier que le runner consomme bien la file et que le conteneur d'exécution peut démarrer :
   `docker ps --filter label=codequest.job`, journal `:9464/metrics` (`runner_jobs_active`).
4. Dans la DLQ, lire le champ `failure.kind` du job : `sandbox` (évasion détectée), `timeout`,
   `runner` (indisponibilité) ou `invalid` (charge utile refusée). Ne jamais journaliser le code
   soumis ni les tests cachés.

## Traitement

| Cause | Action |
|---|---|
| Runner indisponible | Redémarrer le service, vérifier l'image et l'accès au socket Docker, puis laisser BullMQ reprendre le job (idempotence par clé). |
| Échec de bac à sable | Ne pas rejouer : la soumission est rejetée et tracée (`network_attempt`, `seccomp_violation`, `oom`). Prévenir le modérateur si le motif est hostile. |
| Job en DLQ pour erreur transitoire | Remettre le job en `pending` via l'outil d'administration, avec la **même clé d'idempotence** ; une réexécution ne crédite jamais deux fois le score. |
| Charge utile invalide | Corriger la version du contrat `runner-job.md` et renvoyer une soumission depuis l'interface. |

## Vérification

- Le verdict est passé en `passed`/`failed`/`rejected` et le score est cohérent avec
  `scoring.service.ts`.
- Aucun doublon de transaction de récompense (`reason: challenge_reward` avec la même
  `idempotencyKey`).
- Les compteurs `runner_jobs_active` et les alertes Prometheus reviennent à la normale.

En cas de blocage persistant, escalader avec l'identifiant de soumission, le `failure.kind`,
l'heure UTC et l'état des trois files — jamais avec le code source soumis.
