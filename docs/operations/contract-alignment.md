# Alignement des contrats — rapport T269

**Date** : 28 novembre 2026 · **Périmètre** : `openapi.yaml`, `websocket-events.md`,
`runner-job.md`, `assets-service.md`.

Chaque écart identifié lors de l’audit est tracé ci-dessous. « Contrat aligné » signifie que le
document décrit désormais le comportement réel ; « Implémentation corrigée » signifie que le code a
été modifié pour respecter le contrat ; « Dérogation documentée » désigne un écart assumé en v1 avec
son contournement ou sa compensation.

## A — `websocket-events.md`

| # | Écart | Résolution |
|---|---|---|
| E01 | `lastEventId` transmis au handshake mais jamais utilisé | Contrat aligné : champ réservé, repli REST en v1 |
| E02 | Room `leaderboard:<scope>` vs nom composé | Contrat aligné : `leaderboard:<scope>:<scopeId>:<subjectType>:<period>` |
| E03 | `presence.changed` jamais émis | Implémentation corrigée : `online`/`offline` sur la salle `user:<userId>` |
| E04 | `submission.watch` sans handler | Implémentation corrigée : handler d’acquittement avec validation de charge utile |
| E05 | `room.join` refuse `team:` / `event:` | Contrat aligné : ces rooms sont rejointes par les handlers dédiés, pas par `room.join` |
| E06 | `doc.update` diffuse l’état complet | Contrat aligné : état Yjs complet en base64 accepté en v1 |
| E07 | `doc.awareness` sans `docId` | Implémentation corrigée : `docId` ajouté aux deux émissions |
| E08 | `subjectType` supplémentaire dans `leaderboard.updated` | Contrat aligné : champ `subjectType` documenté |
| E09 | Ack `voice.join` avec `ok`/`expiresAt` | Contrat aligné : forme réelle documentée |
| E10 | Limites 8 Kio / 20 rooms / 5 sockets / 3 erreurs | Contrat aligné : `maxHttpBufferSize` appliqué ; plafonds restants gérés par `RealtimeSessions` et le repli REST, à durcir en v2 |

## B — `runner-job.md`

| # | Écart | Résolution |
|---|---|---|
| E11 | `subjectType` figé à `player` pour une équipe | Implémentation corrigée : dérivation depuis `teamId` |
| E12 | DLQ sans remise en `pending` ni backoff | Dérogation documentée : idempotence + runbook « file bloquée », automatisation à venir |
| E13 | Tolérance ±5 % non appliquée au score | Contrat aligné : tolérance de mesure vérifiée par golden tests, pas d’arrondi par bandes |
| E14 | Mode `validate` / priorité 4 inutilisés | Contrat aligné : réservé au recalibrage en v1 |
| E15 | Idempotence d’état côté runner absente | Contrat aligné : déduplication BullMQ + ledger local ; contrôle API en v2 |
| E16 | Alerte 10 s / promotion 60 s absentes | Contrat aligné : timeout API et métriques Prometheus en compensation |
| E17 | Observabilité et digests d’images | Contrat aligné : sous-ensemble de métriques exposé ; digests épinglés au déploiement |

## C — `assets-service.md`

| # | Écart | Résolution |
|---|---|---|
| E18 | `decryption_image` / `parameters` vs champs plats OpenAPI | Contrat aligné : adaptation explicite documentée |
| E19 | `decryptionStyle.cipher` envoyé à plat | Contrat aligné : traduction `parameters.decryptionStyle` documentée |
| E20 | `ciphertext` non contractué | Contrat aligné : champ de réponse ajouté |
| E21 | `maskOpacity` ignoré | Contrat aligné : paramètre réservé en v1 |
| E22 | Suffixe `-<variant>` dans l’objectKey | Contrat aligné : format de chemin corrigé |
| E23 | `degraded` jamais produit, `service` supplémentaire | Contrat aligné : sonde MinIO à brancher, champ `service` documenté |
| E24 | Rate-limit sans `subject.type` | Contrat aligné : clé `(subject.type, subject.id, challengeId)` |
| E25 | Rétention / contre-pression | Contrat aligné : cycle de vie MinIO et capacité du pool documentés |

## D — `openapi.yaml`

| # | Écart | Résolution |
|---|---|---|
| E26 | Routes admin implémentées absentes du contrat | Implémentation contractuelle corrigée : `/admin/stats`, `/admin/users/{userId}/roles`, `/admin/users/{userId}/status`, `/admin/users/{userId}`, `/admin/challenges/{challengeId}` ajoutés |

Les types web générés (`apps/web/src/services/api-types.ts`) restent alignés sur les schémas
existants : les ajouts ci-dessus n’introduisent aucun nouveau schéma de données.
