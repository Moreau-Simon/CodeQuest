# Quickstart — validation de la plateforme CodeQuest

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13
**But** : permettre à un développeur ou à un relecteur de démarrer la plateforme et de prouver, scénario
par scénario, que le comportement observé satisfait les critères de succès de [spec.md](./spec.md).
Ce document est un **guide de validation**, pas une spécification d'implémentation : les détails de
schéma et de conception sont dans [data-model.md](./data-model.md) et [plan.md](./plan.md).

## 1. Prérequis

| Outil | Version minimale | Usage |
|---|---|---|
| Docker Engine + Compose v2 | 24 / 2.20 | orchestration locale |
| Node.js + pnpm | 20 LTS / 9 | apps et services TypeScript |
| Python + uv | 3.12 / 0.4 | service d'assets |
| `runsc` (gVisor) | 2024+ | exécution sandboxée (Linux uniquement) |
| Playwright | dernière | E2E |
| k6 | 0.50 | charge |
| GitHub CLI | 2.40 | workflows |

> Sur macOS/Windows, le runner ne peut pas utiliser gVisor : le profil `local-mock` remplace
> l'exécution par un runner simulé déterministe. Les scénarios marqués **[Linux]** sont alors ignorés.

## 2. Démarrage

```bash
cp .env.example .env          # renseigner les secrets locaux, aucune valeur réelle en dépôt
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @codequest/api prisma migrate deploy
pnpm --filter @codequest/api seed        # rôles, thèmes, cours, défis de référence, boutique
```

> Pour les défis de décryptage (US7), renseigner `ASSETS_SEED_KEY` (hexadécimal de 64 caractères ou
> chaix brut d'au moins 16 caractères) dans l'environnement de l'API **et** du service assets : les deux
> doivent utiliser la même clé, sinon `GET /challenges/{id}` renvoie `503 ASSETS_SEED_MISMATCH`.
> `ASSETS_SERVICE_URL` (défaut `http://localhost:8001`) désigne le service assets, jamais exposé au
> navigateur. La clé ne doit jamais être journalisée ni renvoyée au client.

Services attendus :

| Service | URL locale | Vérification |
|---|---|---|
| Web | http://localhost:5173 | page d'accueil rendue |
| API | http://localhost:3000/api/v1 | `GET /health` → `{"status":"ok"}` |
| Assets | http://localhost:8001/health | `{"status":"ok"}` |
| MinIO console | http://localhost:9001 | bucket `codequest-assets` présent |
| MailHog | http://localhost:8025 | e-mails de confirmation capturés |
| Grafana | http://localhost:3001 | tableau de bord « CodeQuest » provisionné |

Jeu de données de démonstration : `ada@example.test` / `grace@example.test` / `linus@example.test`
(mot de passe `Demo-passw0rd!`), une équipe « Byte Me », un event `standard` ouvert et un event
`battle_royale` planifié à 8 participants.

## 3. Commandes de vérification

```bash
pnpm lint && pnpm typecheck          # portes bloquantes (principe IV)
pnpm test                            # Vitest (web + unités API)
pnpm test:integration                # Jest + Testcontainers (PostgreSQL, Redis)
pnpm --filter @codequest/assets test # pytest
pnpm e2e                             # Playwright, parcours critiques
pnpm test:golden                     # non-régression du scoring
k6 run infra/load/submissions.js     # charge : 100 soumissions/min
```

## 4. Scénarios de validation

### S1 — Inscription et confirmation (SC-001, SC-011, SC-015)

1. Ouvrir http://localhost:5173/register, créer un compte avec un pseudo de 3–20 caractères.
2. Constater l'e-mail dans MailHog, cliquer le lien, se connecter.
3. **Attendu** : parcours complet sous 2 min, cookies `HttpOnly` visibles dans les DevTools
   (`access_token`, `refresh_token`), navigation entièrement possible au clavier.
4. Vérifier qu'un compte **non confirmé** peut lire le lore et les classements mais que
   `POST /challenges/{id}/submissions` renvoie `403` (clarification 3, FR-003, FR-074).

### S2 — Cycle de soumission et verdict (SC-002, SC-006, SC-011)

**Variante A — défi `sorting` (score CPU)**

1. Se connecter en `ada`, ouvrir un défi `sorting`, soumettre la solution de référence.
2. **Attendu** : réponse `202` immédiate, verdict `passed` reçu en moins de 10 s (événement
   `submission.verdict` ou repli par interrogation).
3. Soumettre deux fois la même solution ; **attendu** : scores à ±5 % (SC-006), meilleur score retenu
   dans `best_scores`, classement mis à jour en moins de 5 s (SC-009).
4. Couper le temps réel (bloquer `/realtime` dans les DevTools) et soumettre à nouveau ; **attendu** :
   le verdict arrive quand même via le repli (FR-034).

**Variante B — défi `debugging` / `decryption` (score de résolution, A5)**

1. Ouvrir un défi `debugging` depuis le catalogue : la page « Espace de débogage » affiche l'énoncé et
   le **code bogué préchargé** dans l'éditeur. **Attendu** : ni la correction, ni le bug, ni les tests
   cachés ne sont visibles (le panneau latéral ne liste que les numéros de lignes modifiées).
2. Soumettre avant d'avoir cliqué « Démarrer l'essai » ; **attendu** : `400 ATTEMPT_REQUIRED`. Le bouton
   « Soumettre » est désactivé tant que l'essai n'a pas démarré ; le simple fait d'ouvrir la page ne
   démarre aucun chrono (clarification 2, FR-062).
3. Cliquer « Démarrer l'essai » : `POST /challenges/{id}/attempts` renvoie `201` avec `startedAt` et
   `expiredAt`. Un second appel renvoie `409 ATTEMPT_ALREADY_STARTED` : **une seule tentative par
   `(défi, joueur)` en v1** (clarification 6, A5).
4. Modifier une ligne du code, constater le compteur « 1 ligne(s) modifiée(s) » et la surbrillance de
   la ligne, puis soumettre avec `attemptId`. **Attendu** : la soumission `202` porte
   `modifiedLines = 1` et `attemptId` ; le score est calculé sur `startedAt → verdictAt` (plafonné à
   `t_max_ms`), avec bonus temps seulement si `modified_lines ≤ max_modified_lines` et pénalités
   configurées au-delà (clarification 6).
5. Pour un défi `decryption`, ouvrir le détail en tant que joueur connecté : `GET /challenges/{id}`
   contient une `instance` avec `ciphertext` et `seedFingerprint`. **Attendu** : aucun champ `seed`,
   aucune graine, aucune réponse attendue ; deux joueurs reçoivent des `ciphertext` et empreintes
   différents. La vérification côté assets compare en temps constant et ne renvoie qu'un motif
   générique en cas d'échec (FR-040, FR-041).
6. **Contrôle de non-fuite** : la charge utile de `GET /challenges/{id}`, les événements temps réel et
   la page web ne doivent contenir ni `referenceSolutionEncrypted`, ni `testsEncrypted`, ni la graine
   HMAC (`ASSETS_SEED_KEY`). Le test d'intégration `apps/api/test/integration/debugging.spec.ts`
   échoue si une solution de référence est exposée ; le test E2E SC-007 couvre le reste (S3).

### S3 — Non-fuite des tests cachés (SC-007)

```bash
pnpm --filter @codequest/api test:e2e -- --grep "no hidden test leak"
```

**Attendu** : aucune charge utile REST, temps réel ou asset ne contient de test caché, de solution de
référence ni de clé de déchiffrement ; la commande échoue si une fuite est détectée.

### S4 — Isolation du bac à sable (SC-008) **[Linux]**

```bash
pnpm --filter @codequest/runner test:escape
```

Quatre charges hostiles sont exécutées : connexion réseau sortante, lecture de `/etc/shadow`, bombe de
fork, allocation mémoire massive. **Attendu** : `status = rejected` pour les quatre, zéro évasion,
`networkAttempts` ou `seccompViolations` non nul dans le résultat du job.

### S5 — Équipe et édition collaborative (SC-011)

1. `ada` crée une équipe, invite `grace` ; `grace` rejoint.
2. `ada` tente de désigner une soumission officielle alors qu'elle n'est pas capitaine → `403`.
3. `ada` (capitaine) désigne la soumission de `grace` comme officielle ; re-désigne une autre
   soumission → **attendu** : le dernier désigné remplace le précédent, sans agrégation
   (clarification 1, FR-046).
4. Ouvrir le même défi dans deux navigateurs : les frappes convergent sans conflit, les curseurs de
   présence sont visibles (FR-057).

### S6 — Event à essai unique (SC-011)

1. S'inscrire à l'event `standard` (`POST /api/v1/events/{id}/join` → `201`), ouvrir la page du
   défi **sans** démarrer.
2. **Attendu** : aucun chronomètre actif, `attempt_started_at` et `attempt_consumed_at` restent nuls
   (clarification 2, FR-062). Le compte à rebours affiché est calculé depuis `serverNow`, renvoyé par
   `GET /events` : l'horloge du navigateur ne fait pas foi.
3. Cocher la confirmation puis cliquer « Démarrer l'essai » → `POST /api/v1/events/{id}/start` renvoie
   `200` et pose les deux horodatages ; un second appel renvoie `409 ATTEMPT_ALREADY_CONSUMED`.
4. Soumettre après `ends_at` via un client HTTP direct (`POST /challenges/{id}/submissions` avec
   `eventId`) → **attendu** : refus `409 EVENT_CLOSED`, aucune soumission enregistrée. Une seconde
   soumission dans la fenêtre est également refusée (`409 EVENT_ATTEMPT_ALREADY_USED`).
5. Fermer le navigateur après avoir démarré : il n'existe **aucune pause**. Le job
   `events-attempt-expiry` clôt l'essai à la fin de la fenêtre, le marque consommé et refuse toute
   reprise ; les résultats et les corrigés sont alors publiés
   (`GET /events/{id}/results`, `GET /events/{id}/challenges/{challengeId}/solution`).

### S7 — Boss, PV et KO (FR-067 → FR-070)

1. Ouvrir `/bosses` : `GET /api/v1/bosses` liste les phases dans l'ordre et `GET /api/v1/me/health`
   fournit les PV avec `serverNow` (le compte à rebours ne dépend pas du navigateur).
2. Soumettre une phase (`POST /api/v1/bosses/{bossId}/phases/{phaseId}/submissions` → `202`) puis
   échouer le verdict → **attendu** : `health.changed` avec `delta` négatif et des PV régénérés
   1 par 6 minutes hors KO.
3. Faire tomber les PV à 0 → `health.ko` avec `koUntil` à +30 min ; toute soumission de boss renvoie
   `403 BOSS_KO` pendant le KO, avec le motif et l'échéance dans `details`.
4. Restaurer les PV via `HealthService.restore` (potion ; la boutique US11 arrivera ensuite) →
   `health.restored`, `koUntil` remis à `null`.
5. Vaincre les phases dans l'ordre → `boss.phase.cleared` puis `boss.defeated` ; une seconde
   soumission sur le même boss renvoie `409 BOSS_ALREADY_DEFEATED`.

### S8 — Économie et indices (FR-042, FR-072 → FR-076)

1. Acheter un indice sur un défi exploratoire en solo ; **attendu** : solde débité une seule fois,
   `transactions` contient une ligne avec clé d'idempotence.
2. Tenter d'acheter un indice sur un défi `sorting`, pendant un event ouvert, ou contre un boss →
   **attendu** : `409` (clarification 5, FR-075).
3. Rejouer la même requête d'achat avec la même `Idempotency-Key` → **attendu** : même réponse, aucun
   second débit.
4. Vérifier `SUM(transactions.amount) = wallets.balance` via la tâche de contrôle (SC-021).

### S9 — Battle royale (SC-018, FR-097 → FR-101)

1. Lancer l'event `battle_royale` avec 8 participants ; à la clôture d'une manche, éliminer le dernier.
2. **Attendu** : `participant.eliminated` diffusé à tous en moins de 2 s, participant basculé en
   spectateur avec chat dédié.
3. Déconnecter un participant pendant une manche → **attendu** : la manche n'est pas suspendue
   (FR-100) ; au retour, l'état courant est resynchronisé.
4. Vérifier la règle d'élimination : 1 par manche jusqu'à 50 restants, puis 10 % arrondis au supérieur
   (clarification 4, FR-098).
5. Lancer un event avec 7 participants → **attendu** : report, aucun round démarré (FR-101).

### S10 — Chat et modération (SC-019, FR-091 → FR-094)

1. Envoyer un message sur le canal global depuis deux navigateurs ; **attendu** : réception en moins
   d'une seconde chez le destinataire connecté.
2. Tenter d'écrire dans le canal d'une équipe dont on n'est pas membre → **attendu** : refus.
3. Dépasser la limite d'envoi → `chat.sanction` ou `RATE_LIMITED` avec `retryAfterMs`.
4. Signaler un message, le modérer depuis l'admin → `chat.deleted` diffusé, entrée d'audit créée ;
   un modérateur ne peut pas sanctionner un administrateur (FR-090).

### S11 — Suppression de compte et RGPD (SC-017)

1. Supprimer le compte de `linus` (mot de passe + réauthentification récente).
2. **Attendu** : `deleted_at` immédiat, sessions révoquées, scores anonymisés mais toujours classés,
   messages remplacés par « Joueur supprimé ».
3. Exécuter la purge J+30 en environnement de test → données personnelles supprimées, pseudo et
   e-mail libérés.

### S12 — Performance et charge (SC-003, SC-004, SC-005)

```bash
k6 run infra/load/browse.js        # navigation : p95 < 300 ms
k6 run infra/load/submissions.js   # 100 soumissions/min
k6 run infra/load/realtime.js      # 500 connexions simultanées
```

**Attendu** : p95 < 300 ms hors soumissions, aucune perte de message critique, verdict p95 < 10 s ;
l'ajout d'un worker runner augmente linéairement le débit.

### S13 — Sécurité et accessibilité (SC-015, SC-016)

```bash
pnpm test:a11y          # axe-core sur les parcours critiques
pnpm test:browsers      # Playwright : Chrome, Firefox, Safari, Edge + viewports
pnpm security:zap       # OWASP ZAP en mode baseline
```

**Attendu** : zéro violation critique d'accessibilité, parcours complets sur les quatre navigateurs et
les trois formats d'écran, aucune alerte ZAP de sévérité haute.

### S14 — Restauration et intégrité (SC-014, SC-021)

```bash
pnpm ops:backup && pnpm ops:restore --target=scratch
pnpm ops:verify-integrity
```

**Attendu** : restauration complète en moins de 4 h, classements identiques à l'original, soldes égaux
à la somme du registre, comptes dans leur état d'origine.

## 5. Critères de sortie

Une version est validable lorsque : S1 à S14 passent en CI (avec S4 restreint aux runners Linux),
`pnpm test:golden` est vert, la couverture métier est ≥ 80 % (SC-012), et aucune régression n'est
constatée sur les classements reconstruits (SC-009).

## 6. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `connect_error UNAUTHENTICATED` | cookie absent ou expiré | se reconnecter ; vérifier `SameSite` et le domaine |
| Verdict bloqué en `pending` > 60 s | runner indisponible ou file saturée | `docker compose logs runner`, vérifier `runner_queue_depth` |
| `403 CHALLENGE_LOCKED` | prérequis non satisfaits | consulter `missingPrerequisites` dans le détail du défi |
| `409 ATTEMPT_CONSUMED` | essai d'event déjà démarré | comportement attendu, un seul essai par event |
| `400 ATTEMPT_REQUIRED` | soumission debugging/decryption sans `start` explicite | appeler `POST /challenges/{id}/attempts` puis renvoyer `attemptId` |
| `409 ATTEMPT_ALREADY_STARTED` | seconde tentative sur le même défi | comportement attendu (A5), une seule tentative en v1 |
| `503 ASSETS_SEED_MISMATCH` | clés HMAC divergentes entre l'API et le service assets | aligner `ASSETS_SEED_KEY` des deux services puis relancer |
| Images d'assets absentes | MinIO indisponible ou seed purgée | relancer `POST /generate`, la graine reproduit l'identique |
| `runsc` introuvable | hôte non Linux | utiliser le profil `local-mock`, ignorer S4 |
