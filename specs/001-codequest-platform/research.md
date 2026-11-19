# Phase 0 — Research & Decisions: CodeQuest

**Feature**: `001-codequest-platform` · **Date**: 2026-11-13

Ce document résout les inconnues techniques du plan. Chaque décision est reliée aux principes de la
constitution et aux exigences de la spécification.

---

## R1. Isolation d'exécution du code utilisateur

- **Decision**: gVisor (`runsc`) comme runtime de conteneur pour chaque exécution, piloté par
  `services/runner` ; conteneur éphémère `--network=none --read-only --cap-drop=ALL`, utilisateur non
  privilégié, `no-new-privileges`, montage `tmpfs` borné pour les fichiers temporaires, profil seccomp
  dédié, limites cgroups v2 (CPU quota, mémoire, pids), timeout dur.
- **Rationale**: gVisor intercepte les appels système en espace utilisateur, ce qui réduit fortement la
  surface d'attaque par rapport à un simple conteneur Docker, sans la complexité d'exploitation de
  Firecracker (noyau, images, réseau). Il s'installe sur un hôte Linux unique, ce qui correspond à la
  cible de déploiement. Le runner est le seul composant autorisé à lancer du code utilisateur
  (principe I).
- **Alternatives considered**: Firecracker (isolation plus forte mais micro-VM et gestion d'images plus
  lourdes, surdimensionné pour 100 soumissions/min) ; `isolate`/`nsjail` seuls (plus simple mais
  repose entièrement sur les namespaces/seccomp de l'hôte, surface plus large) ; Judge0 hébergé
  (dépendance externe, non conforme à l'exigence de tests cachés injectés côté runner).

## R2. Mesure du temps CPU

- **Decision**: pour chaque exécution, lire le delta de `cpu.stat` (`usage_usec`) du cgroup v2 du
  conteneur avant et après la phase de tests ; 5 exécutions successives par soumission, score fondé
  sur la **médiane** ; écart-type conservé pour la journalisation ; `t_opt` et `t_max` stockés par
  version de défi, recalibrés à la validation.
- **Rationale**: la comptabilité cgroup inclut tous les processus de l'arbre (interpréteur + runtime),
  contrairement à un `getrusage` du seul processus père ; elle est insensible à la charge des autres
  conteneurs. La médiane neutralise les pics isolés, et la tolérance ±5 % évite les variations non
  significatives (principe III).
- **Alternatives considered**: temps mural (rejeté par la spec, dépendant de la charge) ; `perf`
  hardware counters (précision supérieure mais dépendante du matériel et indisponible en conteneur
  standard) ; moyenne des 5 runs (plus sensible aux valeurs extrêmes).

## R3. File d'exécution et contre-pression

- **Decision**: BullMQ sur Redis, une file `submissions` et une file `dead-letter` ; chaque job porte
  un `submission_id` idempotent ; concurrence du runner configurable par hôte ; `attempts=1` (un échec
  d'infrastructure repasse en file, un échec de code ne se rejoue pas) ; quota de jobs en attente et
  rejet explicite au-delà.
- **Rationale**: BullMQ fournit retries, délais, priorités et tableaux de bord compatibles avec Redis
  déjà présent ; l'idempotence par `submission_id` évite les doubles scores lors d'une reprise.
- **Alternatives considered**: RabbitMQ/Kafka (robustesse supérieure mais brique d'exploitation
  supplémentaire) ; table PostgreSQL comme file (suffisant à faible charge, mais verrouillage et
  polling moins efficaces sous 100 soumissions/min).

## R4. Authentification et sessions

- **Decision**: mot de passe Argon2id (paramètres OWASP : 19 MiB, 2 itérations, parallélisme 1, sel
  aléatoire) ; access token JWT signé (15 min) ; refresh token opaque de 256 bits stocké **haché**
  (SHA-256) avec rotation à chaque usage et détection de réutilisation — la réutilisation d'un jeton
  déjà consommé révoque toute la famille de sessions ; cookies `HttpOnly`, `Secure`, `SameSite=Lax` ;
  expiration glissante **7 jours d'inactivité**, plafond absolu **30 jours** ; réauthentification
  récente (≤ 15 min) exigée pour changement de mot de passe et suppression de compte.
- **Rationale**: conforme aux exigences FR-004 à FR-011 et au principe II ; la rotation avec détection
  de réutilisation est la protection standard contre le vol de refresh token.
- **Alternatives considered**: sessions serveur classiques uniquement (simple mais coûteux à valider à
  chaque requête sous 1 000 utilisateurs) ; JWT de longue durée (révocation impossible, rejeté).

## R5. Modèle RBAC

- **Decision**: tables `roles`, `permissions`, `role_permissions`, `user_roles` ; permissions nommées
  `<domaine>:<action>` ; guard global NestJS qui refuse par défaut toute route sans métadonnée de
  permission (sauf `@Public()`) ; le rôle `team_captain` est dérivé de l'appartenance à une équipe et
  jamais stocké dans `user_roles`.
- **Rationale**: répond à FR-018 à FR-020 (cumul de rôles, refus par défaut) et évite la dérive entre
  routes publiques et protégées.
- **Alternatives considered**: CASL/abilities (expressif mais redondant pour un ensemble fini de
  permissions) ; vérifications manuelles par contrôleur (oublis fréquents, rejeté).

## R6. Chiffrement des tests cachés et des solutions

- **Decision**: AES-256-GCM applicatif avec clé de 32 octets fournie par l'environnement (hors dépôt),
  nonce aléatoire de 12 octets par enregistrement, AAD = `challenge_version_id` ; le déchiffrement
  n'a lieu que côté runner, jamais côté API web ni navigateur ; clé versionnée (`key_id`) pour
  permettre la rotation.
- **Rationale**: satisfait FR-029, FR-110 et le principe II ; l'AAD lie le chiffré à sa version de
  défi, empêchant la substitution d'un test par un autre.
- **Alternatives considered**: chiffrement au niveau disque seul (insuffisant si la base fuit) ;
  KMS cloud (dépendance externe non retenue pour l'hébergement cible).

## R7. Classements quasi temps réel

- **Decision**: Redis ZSET par portée (`global`, `theme:<id>`, `season:<id>`, `event:<id>`,
  `team:<id>`), `score = score_metier * 10^6 + (MAX_TS - submission_ts)` pour encoder le départage
  « soumission la plus ancienne d'abord » dans le score trié ; écriture après transaction PostgreSQL
  réussie ; job périodique de reconstruction complète depuis `best_scores`.
- **Rationale**: lecture en O(log N), cohérence garantie par la reconstruction (FR-049, SC-009) ;
  l'encodage du départage dans le score évite une seconde structure de tri.
- **Alternatives considered**: tri à la volée en SQL (rejeté, dépasse la cible p95 sous charge) ;
  classement uniquement Redis (perte au redémarrage, inacceptable).

## R8. Temps réel

- **Decision**: Socket.IO avec adaptateur Redis pour la diffusion multi-instance ; authentification du
  socket à l'ouverture par le cookie de session, fermeture immédiate à la révocation ; rooms par
  utilisateur, équipe, canal de chat et event ; repli par interrogation périodique (`GET
  /submissions/{id}`) exposé aux clients.
- **Rationale**: FR-017, FR-034 et FR-091 à FR-094 ; l'adaptateur Redis permet de passer de une à
  plusieurs instances d'API sans changer le contrat client.
- **Alternatives considered**: WebSocket brut (moins de fonctionnalités de reconnexion) ; SSE (suffisant
  pour les verdicts, insuffisant pour le chat et la collaboration).

## R9. Édition collaborative

- **Decision**: Yjs (CRDT) côté client et serveur, document par `(team_id, challenge_id)`, transport
  binaire sur le canal temps réel ; persistance périodique de l'état du document et compaction ;
  curseurs de présence diffusés en éphémère.
- **Rationale**: résout la convergence sans verrou ni gestion de conflits manuelle (FR-057) ; Yjs est
  explicitement retenu par la spécification.
- **Alternatives considered**: Operational Transform (complexité de transformation supérieure) ;
  verrouillage par section (UX dégradée pour un binôme).

## R10. Voix

- **Decision**: LiveKit auto-hébergé (SFU WebRTC) ; jetons d'accès signés à durée courte émis par
  l'API après vérification de l'appartenance au canal ; **aucune fonction d'enregistrement activée ni
  exposée** ; présence et mute gérés côté serveur.
- **Rationale**: FR-095, FR-096, SC-020 ; délègue la signalisation et le routage média, ce qui évite
  de développer soi-même une brique complexe.
- **Alternatives considered**: P2P WebRTC (ne passe pas à l'échelle au-delà de quelques participants) ;
  intégration Discord (hors périmètre, sortirait l'expérience de la plateforme).

## R11. Génération de contenu par graine

- **Decision**: seed = HMAC-SHA256(clé serveur, `challenge_id | subject_type | subject_id | version`) ;
  PRNG déterministe (xoshiro128**) côté service d'assets, jamais exposé au client ; la même seed
  reproduit exactement l'instance d'un joueur, y compris après redéploiement.
- **Rationale**: FR-040, FR-041 ; empêche le partage de solutions entre joueurs tout en garantissant la
  stabilité de l'instance (edge case « image régénérée »).
- **Alternatives considered**: UUID aléatoire stocké par instance (volume de stockage important) ;
  seed côté client (contournable, rejeté).

## R12. Service d'assets

- **Decision**: microservice Python 3.12 (FastAPI) exposant `POST /generate` et `POST /verify`, sans
  état, idempotent par seed ; images écrites dans MinIO puis référencées par URL signée courte ;
  bibliothèques Pillow, `qrcode`, `stegano` ; temps de génération borné et mis en cache par seed.
- **Rationale**: le PDF impose Python pour ces bibliothèques ; séparer le service évite d'alourdir
  l'image Node et permet de limiter ses ressources.
- **Alternatives considered**: bibliothèques Node équivalentes (écosystème QR/stégano moins mature) ;
  génération à la volée dans l'API (couplage et pic CPU sur le chemin web).

## R13. Anti-triche

- **Decision**: trois barrières complémentaires — instances uniques par seed (R11), tests cachés jamais
  transmis, et détection asynchrone de similarité par normalisation AST/tokens (tree-sitter pour
  Python et JavaScript) puis indice de Jaccard sur shingles, au-delà d'un seuil configurable, avec
  journalisation pour revue humaine (aucune sanction automatique).
- **Rationale**: FR-114 ; la détection informe sans bloquer, ce qui évite les faux positifs
  pédagogiques.
- **Alternatives considered**: comparaison de texte brut (contournée par renommage) ; blocage
  automatique (risque de sanction injuste).

## R14. Observabilité

- **Decision**: logs structurés JSON (pino) avec masquage des champs `password`, `token`, `email` ;
  métriques Prometheus via `prom-client` (latence HTTP par route, profondeur de file, durée
  d'exécution, taux d'erreur, connexions temps réel) ; tableaux de bord Grafana versionnés dans
  `infra/grafana` ; alertes sur file bloquée > 2 min et taux de 5xx > 1 % sur 5 min.
- **Rationale**: FR-116, SC-013 ; les signaux sont directement dérivés des critères de succès.
- **Alternatives considered**: APM SaaS (coût et dépendance externe) ; OpenTelemetry complet dès la v1
  (utile mais reportable ; les traces peuvent être ajoutées sans changer les contrats).

## R15. Persistance, migrations et identifiants

- **Decision**: Prisma comme ORM et Prisma Migrate pour des migrations versionnées et réversibles ;
  clés primaires **UUIDv7** générées côté application pour des identifiants triables sans exposer de
  volumétrie ; contraintes d'unicité en base pour les règles critiques (pseudo, e-mail, un essai par
  event, clé d'idempotence) ; index `(challenge_id, score DESC, created_at ASC)` pour les classements.
- **Rationale**: FR-065 et FR-073 exigent des garanties d'intégrité que seul le niveau base peut tenir ;
  UUIDv7 améliore la localité d'index par rapport à UUIDv4.
- **Alternatives considered**: TypeORM (moins de garanties de typage des migrations) ; entiers
  auto-incrémentés exposés (fuite de volumétrie et couplage).

## R16. Économie : registre immuable

- **Decision**: `transactions` en append-only avec `idempotency_key` unique, `amount` signé, `reason`,
  `wallet_id`, `created_at` ; solde matérialisé dans `wallets.balance` mis à jour dans la même
  transaction SQL ; contrôle de cohérence périodique (solde = somme du registre) exposé en métrique.
- **Rationale**: FR-072, FR-073, SC-021 ; l'unicité de la clé garantit l'absence de double débit même en
  cas de rejeu réseau.
- **Alternatives considered**: solde seul sans registre (auditabilité impossible) ; reconstruction du
  solde à chaque lecture (coût sous charge).

## R17. PWA et hors ligne

- **Decision**: manifeste + service worker généré par Workbox ; stratégie *stale-while-revalidate* pour
  les cours déjà consultés, *network-only* pour tout ce qui touche score, soumission, économie et
  temps réel ; notification Web Push pour events à venir et fin de KO, après autorisation explicite.
- **Rationale**: FR-103, FR-104 ; évite de servir des données de score périmées ou des formulaires
  inutilisables hors ligne.
- **Alternatives considered**: mise en cache globale (risque d'incohérence de classement) ; aucune PWA
  (hors périmètre imposé).

## R18. Temps, fuseaux et horloges

- **Decision**: tous les horodatages stockés en UTC (`timestamptz`) ; chaque event porte un fuseau IANA
  explicite validé à l'enregistrement ; les échéances de round, d'essai et de régénération de PV sont
  calculées côté serveur à partir de l'horloge de la base, jamais du client ; dérive d'horloge tolérée
  et surveillée.
- **Rationale**: évite les litiges de clôture d'event (edge case « soumission à l'instant de clôture »)
  et les incohérences de battle royale (FR-097).
- **Alternatives considered**: horodatage local par event (ambigu à l'heure d'été) ; horloge client
  (manipulable).

## R19. Configuration et secrets

- **Decision**: `.env.example` exhaustif sans valeur réelle ; validation de l'environnement au démarrage
  (zod) avec échec rapide ; en production, secrets injectés par Docker secrets ou variables d'un
  gestionnaire d'hébergement ; Gitleaks en pré-commit et CI.
- **Rationale**: FR-111 et principe II ; l'échec au démarrage évite un service silencieusement
  mal configuré.
- **Alternatives considered**: fichier `.env` versionné (interdit) ; valeurs par défaut permissives
  (risque de production non sécurisée).

## R20. Stratégie de tests et jeux « golden »

- **Decision**: pyramide Vitest (front/unités) → Jest + Testcontainers (intégration API/PostgreSQL/
  Redis) → Playwright (E2E) → k6 (charge) → ZAP/axe-core (sécurité/accessibilité) ; pour chaque défi de
  référence, un jeu golden (correct lent, correct optimal, incorrect) avec scores attendus figés ;
  toute dérive du moteur de scoring échoue en CI.
- **Rationale**: FR-035, SC-006, SC-011, SC-012 ; les golden tests sont la seule protection réaliste
  contre une régression silencieuse de la mesure CPU.
- **Alternatives considered**: tests de snapshot sur les scores uniquement (fragiles aux arrondis) ;
  tests manuels avant release (non reproductibles).

## Constantes d'équilibrage (paramétrables, valeurs par défaut)

Ces valeurs restent modifiables par configuration ou par le back-office, sans migration :

| Paramètre | Défaut | Source |
|---|---|---|
| PV maximum par joueur | 100 | spec FR-067 |
| Régénération passive | 1 PV / 6 min | PDF §4.5 |
| Durée de KO | 30 min | PDF §4.5 |
| Coût d'un échec de boss | 10 à 25 PV selon le boss | PDF §4.5 |
| Tolérance de mesure | ±5 % | spec FR-032 |
| Nombre d'exécutions mesurées | 5 (médiane) | spec FR-031 |
| Élimination battle royale | 1/manche, puis 10 % après 50 | clarification 4 |
| Inactivité de session | 7 j glissants, plafond 30 j | recherche R4 |
| Rétention des journaux | 12 mois | PDF §9 |
| Purge après suppression de compte | 30 jours | spec FR-012 |
| Taille d'équipe | 2 à 5, configurable | spec FR-056 |
| Participants minimum battle royale | 8 | spec FR-101 |
| Palier XP de base | 100 XP (niveau 1 → 2) | décision Phase 8, `xp.curve` |
| Croissance des paliers | +50 XP par niveau | décision Phase 8, `xp.curve` |
| Niveau maximum | 100 | décision Phase 8, `xp.curve` |
| XP par défi réussi | `max(10, score)` | décision Phase 8, `xp.awarded` |

Courbe retenue (US6, FR-054) : `xpForLevel(L) = base*(L-1) + growth*(L-1)*(L-2)/2`, soit
0 / 100 / 250 / 450 / 700 … avec les valeurs par défaut. La configuration est lue dans
`platform_settings` sous la clé `xp.curve` (`{ base, growth, maxLevel }`) : aucun changement de
schéma n'est nécessaire pour recalibrer. Un défi ne rapporte de l'XP qu'une seule fois par
joueur (trace d'audit `xp.awarded` par `(user_id, challenge_id)`).
