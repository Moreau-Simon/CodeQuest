# Phase 1 — Data Model: CodeQuest

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13
**Source de vérité** : [spec.md](./spec.md) (FR-001 → FR-118) ; décisions techniques : [research.md](./research.md)

## Conventions

- Toutes les clés primaires sont des **UUIDv7** générés côté application (`id uuid PK`).
- Tous les horodatages sont `timestamptz` en **UTC** ; les fuseaux d'affichage sont portés par les
  entités qui en ont besoin (`events.timezone`, IANA).
- Suppression : logique (`deleted_at`) pour les comptes et messages, physique pour les données
  personnelles après purge (FR-012, FR-013).
- Les montants monétaires (`bits`) sont des entiers ; aucun flottant.
- Les scores sont des `numeric(12,2)` ; les temps sont des entiers de millisecondes.
- Toute contrainte métier critique est doublée en base (unicité, clé étrangère, index partiel) et non
  seulement dans le code applicatif.

## Enumerations

| Enum | Valeurs |
|---|---|
| `user_status` | `pending`, `active`, `suspended`, `deleted` |
| `challenge_type` | `sorting`, `debugging`, `decryption`, `steganography`, `qr_code` |
| `challenge_status` | `draft`, `validating`, `published`, `archived` |
| `submission_status` | `pending`, `running`, `passed`, `failed`, `error`, `timeout`, `rejected` |
| `subject_type` | `player`, `team` |
| `event_type` | `standard`, `battle_royale` |
| `event_status` | `draft`, `scheduled`, `open`, `finished`, `archived` |
| `team_member_role` | `captain`, `member` |
| `shop_item_kind` | `hint`, `potion`, `avatar`, `title`, `editor_theme`, `early_access` |
| `transaction_reason` | `challenge_reward`, `record_bonus`, `event_reward`, `boss_reward`, `achievement`, `streak`, `hint_purchase`, `potion_purchase`, `cosmetic_purchase`, `admin_adjustment`, `refund` |
| `chat_channel_kind` | `global`, `team`, `event`, `spectator` |
| `sanction_kind` | `mute`, `ban` |
| `report_status` | `open`, `reviewed`, `dismissed` |
| `round_status` | `scheduled`, `open`, `closed` |

## 1. Identité et accès

### `users`
| Champ | Type | Contrainte |
|---|---|---|
| id | uuid PK | |
| email | citext | UNIQUE, format RFC 5322, normalisé en minuscules |
| pseudonym | citext | UNIQUE, 3–20 caractères, `[a-zA-Z0-9_-]` |
| password_hash | text | Argon2id, jamais journalisé |
| email_verified_at | timestamptz | null = compte en lecture seule publique (FR-003) |
| status | user_status | défaut `pending` |
| preferred_language | text | défaut `python` (contrainte : langage supporté) |
| avatar_key | text | clé MinIO |
| level | int | ≥ 1, dérivé de `xp` |
| xp | int | ≥ 0 |
| preferences | jsonb | `{ sound: {master,music,effects,voice}, reduced_motion, theme }` |
| created_at / updated_at / deleted_at | timestamptz | |

Règles : e-mail et pseudo uniques y compris parmi les comptes logiquement supprimés (réservation 30 j
puis libération à la purge) ; un compte `deleted` n'est plus authentifiable (FR-012).

### `roles`, `permissions`, `role_permissions`, `user_roles`
| Table | Champs clés | Contraintes |
|---|---|---|
| `roles` | id, key UNIQUE (`player`, `moderator`, `admin`), label, is_global | le rôle `team_captain` n'est **pas** une ligne de `roles` |
| `permissions` | id, key UNIQUE (`challenge:write`, `user:ban`, `chat:moderate`), label | |
| `role_permissions` | role_id FK, permission_id FK | PK composite |
| `user_roles` | user_id FK, role_id FK, granted_by FK users, created_at | PK composite ; interdit l'auto-attribution (FR-020) |

### `sessions`
| Champ | Type | Contrainte |
|---|---|---|
| id | uuid PK | identifiant de session |
| user_id | uuid FK users | ON DELETE CASCADE à la purge |
| refresh_token_hash | text | UNIQUE, SHA-256 du jeton opaque |
| token_family_id | uuid | famille de rotation (réutilisation ⇒ révocation de la famille) |
| rotated_from | uuid FK sessions | chaîne de rotation |
| user_agent | text | tronqué |
| ip_prefix | inet | /24 ou /48 (minimisation RGPD) |
| last_used_at | timestamptz | expiration glissante 7 j |
| expires_at | timestamptz | plafond absolu 30 j |
| revoked_at / revoked_reason | timestamptz / text | `logout`, `password_change`, `reuse_detected`, `admin` |

### `password_reset_tokens`
`id`, `user_id` FK, `token_hash` UNIQUE, `expires_at` (création + 1 h), `used_at` (usage unique).

### `push_subscriptions`
`id`, `user_id` FK, `endpoint` UNIQUE, `keys` jsonb, `created_at`, `revoked_at` (FR-104).

## 2. Contenu pédagogique et défis

### `themes`
`id`, `slug` UNIQUE, `name`, `lore_region_chapter_id` FK `lore_chapters` (nullable), `sort_order`.

### `challenges`
| Champ | Type | Contrainte |
|---|---|---|
| id | uuid PK | |
| theme_id | uuid FK themes | NOT NULL |
| type | challenge_type | NOT NULL |
| difficulty | smallint | CHECK 1..5 |
| title | text | 3–120 caractères |
| statement_md | text | version courante éditable en brouillon |
| languages | text[] | sous-ensemble de `{python, javascript}` (FR-026) |
| base_points | int | ≥ 0 (`100 × difficulté` par défaut) |
| perf_max | int | ≥ 0 |
| t_opt_ms / t_max_ms | int | `0 < t_opt < t_max`, recalculés à la validation |
| status | challenge_status | défaut `draft` |
| is_event_only / is_boss_phase | boolean | |
| current_version | int | ≥ 1, pointeur vers `challenge_versions.version` |
| created_by | uuid FK users | |
| created_at / updated_at | timestamptz | |

### `challenge_versions`
`id`, `challenge_id` FK, `version` int, `statement_snapshot` text, `tests_encrypted` bytea,
`reference_solution_encrypted` bytea, `key_id` text, `created_by`, `created_at`.
UNIQUE `(challenge_id, version)`. Immuable après publication (FR-087) ; les soumissions référencent la
version jouée.

### `challenge_prerequisites`
`id`, `challenge_id` FK, `required_challenge_id` FK nullable, `required_level` int nullable,
`required_lesson_id` FK nullable, `required_lore_chapter_id` FK nullable.
CHECK : exactement **une** des quatre conditions renseignée. Le graphe est validé acyclique à
l'écriture (FR-024) par parcours en profondeur dans le service `challenges`.

### `lessons`
`id`, `theme_id` FK, `slug` UNIQUE, `title`, `content_md`, `order`, `positioning_test` jsonb,
`estimated_minutes`, `status` (`draft`/`published`).

### `lesson_progress`
`user_id` FK, `lesson_id` FK, `status` (`not_started`/`in_progress`/`completed`), `quiz_score`,
`completed_at`. PK composite `(user_id, lesson_id)`.

### `lore_chapters`
`id`, `slug` UNIQUE, `title`, `content_md`, `required_level`, `order`, `audio_key`.

### `lore_progress`
`user_id` FK, `chapter_id` FK, `unlocked_at`, `read_at`. PK composite.

### `challenge_hints`
`id`, `challenge_id` FK, `order`, `content`, `price_bits` ≥ 0.
Contrainte applicative : aucun hint pour un défi `type = sorting` (clarification 5).

### `hint_purchases`
`id`, `user_id` FK, `challenge_id` FK, `hint_id` FK, `transaction_id` FK transactions,
`purchased_at`. UNIQUE `(user_id, hint_id)`. Interdit si event ouvert ou boss en cours (FR-075).

## 3. Jeu : soumissions, scores, classements

### `submissions`
| Champ | Type | Contrainte |
|---|---|---|
| id | uuid PK | |
| challenge_id / challenge_version_id | uuid FK | NOT NULL |
| user_id | uuid FK users | auteur de l'essai |
| team_id | uuid FK teams | nullable |
| event_id | uuid FK events | nullable |
| language | text | `python` ou `javascript` |
| code | text | taille bornée (ex. 128 Kio) |
| status | submission_status | défaut `pending` |
| cpu_times_ms | int[] | 5 mesures |
| cpu_time_median_ms | int | calculé |
| tests_passed / tests_total | int | `0 ≤ passed ≤ total` |
| score | numeric(12,2) | `0 ≤ score ≤ base_points + perf_max` |
| verdict_reason | text | masqué pour les tests cachés |
| attempt_no | int | ≥ 1 |
| is_official | boolean | réservé aux soumissions d'équipe désignées |
| created_at / started_at / finished_at | timestamptz | |

Index : `(challenge_id, score DESC, created_at ASC)`, `(user_id, created_at DESC)`,
`(event_id, user_id)`, `(team_id, challenge_id)`.

### `best_scores`
`id`, `challenge_id` FK, `subject_type` subject_type, `subject_id` uuid, `score`, `submission_id` FK,
`achieved_at`. **UNIQUE `(challenge_id, subject_type, subject_id)`**. Seul le meilleur score est
conservé (FR-033).

### `team_official_submissions`
`id`, `team_id` FK, `challenge_id` FK, `submission_id` FK, `designated_by` FK users (capitaine),
`designated_at`. **UNIQUE `(team_id, challenge_id)`** : le dernier désigné remplace le précédent ;
aucune agrégation des membres (clarification 1, FR-046).

Règle (arbitrage du 20 nov. 2026) : à chaque désignation, `team_official_submissions` est la source
de vérité ; `submissions.is_official` est son miroir transactionnel et
`best_scores(subject_type = 'team', subject_id = team_id, challenge_id)` est recalculé dans la même
transaction PostgreSQL. Le ZSET du classement d'équipe (`lb:global:<scope_id>:team`, ainsi que les
portées theme/season) est réécrit **après commit** via `LeaderboardService.recordTeamScore()`, comme
pour les scores individuels ; la reconstruction périodique garantit la cohérence (SC-009).
Attention : `team:<team_id>` désigne une **room Socket.IO** et `lb:team:<team_id>:player` le classement
interne (avec agrégation des joueurs), qui n'est pas le classement d'équipe. Une révocation supprime
la désignation, le miroir et l'entrée `best_scores` correspondante.

### `seasons`
`id`, `name`, `slug` UNIQUE, `starts_at`, `ends_at`. Sert de portée de classement (FR-045).

### `leaderboard_entries` (miroir durable)
`id`, `scope_type` (`global`/`theme`/`season`/`event`/`team`), `scope_id` uuid nullable,
`subject_type`, `subject_id`, `score`, `tiebreak_at`, `rank`, `computed_at`.
UNIQUE `(scope_type, scope_id, subject_type, subject_id)`. Redis ZSET est la lecture rapide ; cette
table est reconstruite périodiquement depuis `best_scores` (FR-049).

## 4. Équipes

### `teams`
`id`, `name` UNIQUE (3–40), `tag` UNIQUE (2–6), `description`, `logo_key`, `captain_id` FK users,
`created_at`, `disbanded_at`.

### `team_members`
`id`, `team_id` FK, `user_id` FK, `role` team_member_role, `joined_at`, `left_at`.
**Index partiel UNIQUE `(user_id) WHERE left_at IS NULL`** : un seul engagement actif (FR-056).

### `team_invitations`
`id`, `team_id` FK, `token_hash` UNIQUE, `invited_user_id` nullable, `invited_pseudonym` nullable,
`created_by` FK, `expires_at`, `accepted_at`, `declined_at`.

## 5. Événements

### `events`
`id`, `slug` UNIQUE, `title`, `timezone` (IANA validé), `starts_at`, `ends_at` (CHECK `ends_at >
starts_at`), `status` event_status, `type` event_type, `max_attempts` (v1 : CHECK `max_attempts = 1`,
aligné sur FR-065 ; champ conservé pour une évolution future documentée par amendement),
`min_participants` (défaut 8 pour battle royale), `elimination_rule` jsonb (défaut
`{"threshold":50,"percent":10}`), `rewards` jsonb, `created_by`.

### `event_challenges`
`event_id` FK, `challenge_id` FK, `order`. PK composite.

### `event_participants`
`id`, `event_id` FK, `subject_type`, `subject_id`, `registered_at`, `attempt_started_at`,
`attempt_consumed_at`, `eliminated_at`.
**UNIQUE `(event_id, subject_type, subject_id)`** : un seul essai par event (FR-065). L'essai n'est
consommé qu'au démarrage explicite (clarification 2, FR-062) ; un abandon ou une fermeture de
navigateur est traité comme consommé lorsque le job d'expiration atteint la fin de la fenêtre
(`attempt_consumed_at` renseigné, soumission ensuite refusée).

## 6. Boss et points de vie

### `bosses`
`id`, `slug` UNIQUE, `name`, `lore_chapter_id` FK, `max_hp` > 0, `rewards` jsonb.

### `boss_phases`
`id`, `boss_id` FK, `order`, `challenge_id` FK, `hp_share` numeric(5,2) (somme = 100),
`damage_rule` jsonb (ex. `{"per_100_score": 5}`). UNIQUE `(boss_id, order)`.

### `player_health`
`id`, `subject_type`, `subject_id`, `hp` int CHECK `0 ≤ hp ≤ max_hp`, `max_hp` (100),
`ko_until` timestamptz nullable, `last_regen_at` timestamptz.
**UNIQUE `(subject_type, subject_id)`**. La régénération est calculée à la lecture puis matérialisée
(1 PV / 6 min, plafonnée).

### `boss_engagements`
`id`, `boss_id` FK, `subject_type`, `subject_id`, `boss_hp_remaining` int, `phase_reached` int,
`defeated_at` nullable. UNIQUE `(boss_id, subject_type, subject_id)` : la victoire n'est comptée
qu'une fois (FR-070).

## 7. Économie

### `wallets`
`id`, `user_id` UNIQUE FK, `balance` bigint CHECK ≥ 0, `updated_at`.

### `transactions` (append-only)
`id`, `wallet_id` FK, `amount` bigint (signé), `reason` transaction_reason,
`reference_type`/`reference_id` (défi, event, boss, badge, item), `idempotency_key` text UNIQUE,
`balance_after` bigint, `created_by` nullable, `created_at`.
Aucune mise à jour ni suppression autorisée (trigger de protection) ; `balance = SUM(amount)` vérifié
par tâche de contrôle (SC-021).

### `shop_items`
`id`, `sku` UNIQUE, `name`, `kind` shop_item_kind, `price_bits` ≥ 0, `is_active`, `metadata` jsonb
(ex. `{"hint_id": ...}`, `{"hp_restore": 50}`), `available_from`/`available_until`.

### `inventory`
`id`, `user_id` FK, `shop_item_id` FK, `quantity` ≥ 0, `equipped` boolean, `acquired_at`.
UNIQUE `(user_id, shop_item_id)`.

### `badges` / `user_badges`
`badges` : `id`, `key` UNIQUE, `name`, `description`, `criteria` jsonb.
`user_badges` : `user_id`, `badge_id`, `awarded_at`. PK composite (FR-077).

## 8. Chat et modération

### `chat_channels`
`id`, `kind` chat_channel_kind, `scope_id` uuid nullable (team_id ou event_id), `name`,
`created_at`. UNIQUE `(kind, scope_id)`.

### `chat_messages`
`id`, `channel_id` FK, `user_id` FK nullable (mis à NULL et `author_label = 'Joueur supprimé'` à la
suppression de compte), `body` (1–2 000 caractères), `created_at`, `deleted_at`, `deleted_by`.

### `chat_reports`
`id`, `message_id` FK, `reporter_id` FK, `reason`, `status` report_status, `created_at`,
`resolved_by`, `resolved_at`.

### `chat_sanctions`
`id`, `user_id` FK, `channel_id` nullable, `kind` sanction_kind, `reason`, `starts_at`, `ends_at`,
`issued_by` FK, `revoked_at`.

## 9. Battle royale

### `battle_rounds`
`id`, `event_id` FK, `round_number` ≥ 1, `challenge_id` FK, `starts_at`, `ends_at`, `status`
round_status. UNIQUE `(event_id, round_number)`.

### `round_results`
`id`, `round_id` FK, `subject_type`, `subject_id`, `submission_id` nullable, `score`,
`submitted_at`, `eliminated` boolean. UNIQUE `(round_id, subject_type, subject_id)`.
Élimination calculée côté serveur selon `events.elimination_rule` (clarification 4, FR-098).

## 10. Administration, audit et anti-triche

### `audit_logs` (append-only)
`id`, `actor_id` FK users, `action`, `target_type`, `target_id`, `metadata` jsonb, `ip_prefix`,
`created_at`. Index `(created_at DESC)`, `(actor_id, created_at DESC)`.
Aucune mise à jour ni suppression (FR-089).

### `similarity_findings`
`id`, `challenge_id` FK, `submission_a_id`/`submission_b_id` FK, `score` numeric(5,4),
`evidence` jsonb, `status` (`open`/`dismissed`/`confirmed`), `created_at`. Aucune sanction
automatique (FR-114).

### `platform_settings`
`key` PK, `value` jsonb, `updated_by`, `updated_at`. Porte les constantes d'équilibrage (voir
[research.md](./research.md#constantes-déquilibrage-paramétrables-valeurs-par-défaut)).

### `notifications`
`id`, `user_id` FK, `kind`, `payload` jsonb, `read_at`, `created_at` (events à venir, fin de KO).

## Transitions d'état

```text
users.status        pending → active → suspended ⇄ active → deleted → (purge après 30 j)
challenges.status   draft → validating → published → archived
                    validating → draft   (si la solution de référence échoue)
submissions.status  pending → running → passed | failed | error | timeout | rejected
sessions            active → rotated (remplacée) | revoked | expired
teams               active → disbanded ; membership active → left | removed
events.status       draft → scheduled → open → finished → archived
player_health       actif (hp > 0) → KO (hp = 0, ko_until) → actif (régénération ou potion)
boss_engagements    non engagé → en cours → vaincu (une seule fois)
chat_reports        open → reviewed | dismissed
chat_sanctions      active → expired | revoked
battle_rounds       scheduled → open → closed
```

Règles de transition : une soumission ne repasse jamais de `passed` à `running` ; une version de défi
publiée est immuable ; une session révoquée ne peut pas être « dé-révoquée » ; un event terminé ne
rouvre pas (un nouveau event est créé).

## Règles d'intégrité et index critiques

| Règle | Mécanisme |
|---|---|
| E-mail et pseudo uniques (FR-001) | UNIQUE sur `users.email`, `users.pseudonym` |
| Une seule équipe active par joueur (FR-056) | index partiel UNIQUE `team_members(user_id) WHERE left_at IS NULL` |
| Un seul essai par event (FR-065) | UNIQUE `event_participants(event_id, subject_type, subject_id)` **et** CHECK `events.max_attempts = 1` |
| Un seul score retenu par sujet et défi (FR-033) | UNIQUE `best_scores(challenge_id, subject_type, subject_id)` |
| Une seule soumission officielle par équipe et défi (FR-046) | UNIQUE `team_official_submissions(team_id, challenge_id)` |
| Pas de double débit (FR-076) | UNIQUE `transactions(idempotency_key)` |
| Classement rapide (FR-045, FR-049) | index `(challenge_id, score DESC, created_at ASC)` + ZSET Redis |
| Victoire de boss unique (FR-070) | UNIQUE `boss_engagements(boss_id, subject_type, subject_id)` |
| Audit inaltérable (FR-089) | trigger `BEFORE UPDATE/DELETE` → exception |
| Ledger inaltérable (FR-073) | idem sur `transactions` |
| Prérequis acycliques (FR-024) | validation applicative + contrainte de clé étrangère |
| Taille d'équipe 2–5 (FR-056) | contrainte applicative transactionnelle + compteur verrouillé |

## Volumétrie, rétention et purge

- Cible : 1 000 utilisateurs actifs simultanés, 5 000 comptes, 100 soumissions/min en pic,
  500 connexions temps réel.
- `submissions` : conservation intégrale 12 mois, puis archivage du code et conservation des métriques
  agrégées ; le code archivé n'est plus consultable par les joueurs.
- `audit_logs` : 12 mois glissants (PDF §9).
- `chat_messages` : conservation 12 mois, suppression logique immédiate sur modération.
- Suppression de compte : `deleted_at` immédiat, purge des données personnelles à J+30, anonymisation
  des scores et messages dès la suppression logique (FR-012, FR-013, SC-017).
- `sessions` expirées et `password_reset_tokens` consommés : purge quotidienne.
- Images d'assets : régénérables par seed ; conservation 90 jours, purge des objets non référencés.
