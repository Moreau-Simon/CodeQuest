# Contrat temps réel — Socket.IO

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13
**Transport** : Socket.IO 4 sur le même origin que l'API (`/realtime`), adaptateur Redis pour la
diffusion multi-instance.

## 1. Connexion et authentification

| Élément | Règle |
|---|---|
| Poignée de main | `io("/realtime", { withCredentials: true, auth: { lastEventId } })` |
| Authentification | Cookie `access_token` (JWT) validé pendant le handshake ; aucun jeton en query string |
| Échec | `connect_error` avec `data.code = "UNAUTHENTICATED" \| "SESSION_REVOKED"` puis déconnexion |
| Révocation | La révocation d'une session ferme tous ses sockets dans les 5 s (`auth.revoke` sur Redis pub/sub) |
| Repli | Si le transport échoue, le client interroge `GET /api/v1/submissions/{id}` toutes les 2 s (FR-034) |
| Reconnexion | Backoff exponentiel plafonné à 30 s, reprise des abonnements via `lastEventId` (champ réservé, non transmis par le client en v1 : le repli REST fait foi) |

Le socket ne transporte **aucune** donnée d'administration sensible et ne remplace jamais un contrôle
d'autorisation REST : chaque événement diffusé est filtré côté serveur par appartenance (FR-092).

## 2. Rooms

| Room | Rejoint par | Contenu diffusé |
|---|---|---|
| `user:<userId>` | tout socket authentifié | verdicts, notifications, état de santé, KO |
| `team:<teamId>` | membres actifs de l'équipe | chat d'équipe, présence, désignation officielle, édition |
| `channel:<channelId>` | audience du canal validée côté serveur | messages, suppressions, sanctions |
| `event:<eventId>` | participants inscrits, spectateurs en lecture | rounds, classement live, éliminations |
| `event:<eventId>:spectators` | éliminés et spectateurs | vue lecture seule (FR-099) |
| `leaderboard:<scope>:<scopeId>:<subjectType>:<period>` | abonnés à un classement affiché | mises à jour incrémentales ; `subjectType` vaut `player` ou `team` |
| `doc:<teamId>:<challengeId>` | membres de l'équipe | deltas Yjs et présence (FR-057) |

## 3. Événements serveur → client

Tous les messages suivent l'enveloppe `{ id, type, at, data }` ; `id` est un UUIDv7 monotone servant
de curseur de reprise.

### 3.1 Soumissions et verdicts (FR-034)

```jsonc
// type: "submission.queued"
{ "submissionId": "uuid", "challengeId": "uuid", "position": 3 }

// type: "submission.started"
{ "submissionId": "uuid", "attemptNo": 1 }

// type: "submission.verdict"
{
  "submissionId": "uuid",
  "status": "passed",            // passed | failed | error | timeout | rejected
  "score": 842.5,
  "cpuTimeMedianMs": 412,
  "testsPassed": 19,
  "testsTotal": 20,
  "verdictReason": "Test caché 7 : sortie incorrecte",
  "isOfficial": false
}
```

`verdictReason` ne divulgue jamais un test caché ni la solution attendue : seule la nature de l'échec
est exposée (FR-029).

### 3.2 Classements (FR-049)

```jsonc
// type: "leaderboard.updated"
{
  "scope": "theme", "scopeId": "uuid", "subjectType": "player", "period": "season",
  "changes": [ { "rank": 1, "subjectId": "uuid", "displayName": "ada", "score": 1520.0 } ],
  "computedAt": "2026-11-13T10:00:00Z"
}
```

Les changements sont incrémentaux et ordonnés ; un client qui détecte un trou de curseur recharge la
page complète (`GET /leaderboards/...`).

### 3.3 PV, boss et KO (FR-067 → FR-070)

```jsonc
// type: "health.changed"
{ "hp": 40, "maxHp": 100, "delta": -25, "reason": "boss_failure", "koUntil": null }

// type: "health.ko"
{ "hp": 0, "koUntil": "2026-11-13T10:30:00Z", "reason": "boss_failure" }

// type: "health.restored"
{ "hp": 50, "source": "potion", "koUntil": null }

// type: "boss.phase.cleared"
{ "bossId": "uuid", "phaseOrder": 2, "bossHpRemaining": 340, "damageApplied": 60 }

// type: "boss.defeated"
{ "bossId": "uuid", "rewards": [{ "kind": "bits", "amount": 500 }] }
```

### 3.4 Chat (FR-091 → FR-094)

```jsonc
// type: "chat.message"
{ "channelId": "uuid", "messageId": "uuid", "authorName": "ada", "body": "…", "createdAt": "…" }

// type: "chat.deleted"
{ "channelId": "uuid", "messageId": "uuid", "deletedBy": "moderator" }

// type: "chat.sanction"
{ "kind": "mute", "expiresAt": "2026-11-13T12:00:00Z", "reason": "spam" }

// type: "chat.typing"
{ "channelId": "uuid", "authorName": "ada", "expiresInMs": 3000 }
```

`chat.typing` est éphémère (jamais persisté) et limité à 1 émission / 2 s par compte (FR-093).

### 3.5 Battle royale (FR-097 → FR-101)

```jsonc
// type: "round.started"
{ "eventId": "uuid", "roundNumber": 3, "challengeId": "uuid", "endsAt": "2026-11-13T10:15:00Z" }

// type: "round.warning"
{ "roundNumber": 3, "remainingMs": 60000 }

// type: "round.closed"
{ "roundNumber": 3, "results": [{ "subjectId": "uuid", "score": 780.0 }] }

// type: "participant.eliminated"
{ "subjectId": "uuid", "roundNumber": 3, "remaining": 49, "reason": "lowest_score" }

// type: "event.finished"
{ "eventId": "uuid", "winner": { "subjectId": "uuid", "displayName": "ada" } }
```

Les échéances de round sont calculées à partir de l'horloge serveur ; `endsAt` fait foi (FR-097,
FR-100). Une déconnexion ne suspend jamais le round.

### 3.6 Présence, collaboration et divers

```jsonc
// type: "presence.changed"
{ "room": "team:uuid", "userId": "uuid", "state": "online" }   // online | idle | offline

// type: "doc.update"    (binaire Yjs encodé en base64)
{ "docId": "teamId:challengeId", "update": "AAA=", "origin": "uuid" }

// type: "doc.awareness"
{ "docId": "…", "clients": [{ "userId": "uuid", "cursor": { "line": 12, "ch": 4 } }] }

// type: "notification.new" — diffusé sur la salle user:<userId> (FR-104)
{ "kind": "event_starting", "payload": { "eventId": "uuid", "startsAt": "…" } }
{ "kind": "ko_ended", "payload": { "endedAt": "…" } }

// type: "voice.token"    (émis après autorisation, jamais dans l'URL)
{ "roomName": "team-uuid", "token": "…", "expiresAt": "…" }
```

## 4. Événements client → serveur

| Événement | Charge utile | Réponse |
|---|---|---|
| `room.join` | `{ room }` | `{ ok, error? }` — refus si non autorisé |
| `room.leave` | `{ room }` | `{ ok }` |
| `submission.watch` | `{ submissionId }` | La salle `user:<id>` est déjà rejointe à la connexion ; acquittement `{ ok }` (ou `INVALID_PAYLOAD`) |
| `chat.send` | `{ channelId, body, clientMessageId }` | Acquittement `{ ok, messageId }` ou `{ ok: false, code }` |
| `chat.typing` | `{ channelId }` | Aucun |
| `doc.update` | `{ docId, update }` | `{ ok }` |
| `doc.awareness` | `{ docId, cursor }` | Aucun |
| `leaderboard.subscribe` | `{ scope, scopeId, period }` | Snapshot initial + flux |
| `voice.join` | `{ roomName }` | `{ token, url }` (FR-095, fr-096) |
| `voice.leave` | `{}` | `{ ok }` |

`clientMessageId` assure l'idempotence de l'envoi de chat en cas de reconnexion.

## 5. Limites et erreurs

- Taille maximale d'un message : 8 Kio (les deltas Yjs sont compressés et plafonnés à 64 Kio).
- Limite de rooms par socket : 20 ; limite de sockets par compte : 5 (les plus anciens sont fermés).
- Erreurs émises sur le canal `error` : `{ code, message, retryAfterMs? }` avec `code` ∈
  `RATE_LIMITED`, `FORBIDDEN_ROOM`, `INVALID_PAYLOAD`, `SESSION_REVOKED`.
- Un socket qui dépasse 3 erreurs de charge utile en 60 s est déconnecté.

## 6. Conformité

| Exigence | Couverture |
|---|---|
| FR-034 verdict temps réel + repli | §1 (repli), §3.1 |
| FR-049 classement < 5 s | §3.2 |
| FR-057 édition collaborative | §2 `doc:*`, §3.6, §4 |
| FR-067 → FR-070 PV / boss / KO | §3.3 |
| FR-091 → FR-094 chat, portée, limitation, modération | §2, §3.4, §5 |
| FR-095, FR-096 voix sans enregistrement, micro explicite | §4 `voice.join`, `voice.token` |
| FR-104 rappels d'événement et fin de KO | §3.6 `notification.new` (salle `user:<userId>`, idempotente par référence) |
| FR-097 → FR-101 rounds, éliminations, spectateurs | §3.5 |
| FR-017 fermeture à la révocation | §1 |

## 7. État d’implémentation (T269, 28 novembre 2026)

- `lastEventId` est réservé : le client v1 ne le transmet pas et s’appuie sur le repli REST (§1).
- Les rooms `team:` / `event:` sont rejointes par les handlers dédiés au chat, aux events et aux
  documents ; `room.join` n’accepte que `user:<id>` et `channel:<id>` pour éviter tout contoursnement
  d’autorisation.
- `doc.update` diffuse l’état Yjs complet encodé en base64 (le delta compressé reste une évolution
  possible), avec `docId` dans l’enveloppe.
- `voice.join` répond `{ ok, token, url, expiresAt }` ; `expiresAt` est redondant avec `voice.token`.
- `maxHttpBufferSize` est fixé à 8 Kio. Les plafonds rooms/sockets et la déconnexion après trois
  erreurs sont gérés par `RealtimeSessions` et le garde-fou REST ; ils restent à durcir en v2.
- `presence.changed` est émis à la connexion (`online`) et à la déconnexion (`offline`) sur la salle
  `user:<userId>`.
