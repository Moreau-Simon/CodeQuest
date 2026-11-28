# Plan de Réalisation – CodeQuest
> **Projet** : Plateforme de défis informatiques & gamification  
> **Contexte** : BUT3 Informatique – R5.05 Programmation Avancée  
> **Référence** : Spécification fonctionnelle et technique v1.0 (23 octobre 2026)

---

## 1. Vue d'Ensemble & Objectifs

**CodeQuest** est une plateforme web d’apprentissage et de compétition algorithmique. Elle associe :
- Des défis de programmation (tri de listes, débogage, cryptographie, stéganographie, QR codes).
- Un bac à sable d'exécution sécurisé mesurant les performances en **temps CPU**.
- Un univers narratif (*lore*) et une gamification poussée (boss, points de vie, monnaie virtuelle *Bits*, boutique).
- Des mécaniques multi-joueurs (équipes, édition collaborative temps réel, battle royale, chat textuel et vocal).

Ce document constitue la **feuille de route opérationnelle** pour le développement étape par étape du projet.

---

## 2. Architecture & Structure du Monorepo

Le projet adopte une architecture en **monolithe modulaire** pour le cœur applicatif, complété par deux microservices isolés dédiés aux tâches spécifiques et sécurisées.

```
projet-codequest/
├── apps/
│   ├── api/                      # Backend NestJS (TypeScript)
│   │   ├── src/
│   │   │   ├── modules/          # Modules : auth, users, challenges, submissions,
│   │   │   │                     # teams, events, bosses, economy, chat, admin
│   │   │   ├── common/           # Guards (RBAC), interceptors, decorators, filters
│   │   │   └── config/           # Configuration et validation d'environnement
│   │   ├── prisma/ ou orm/       # Schéma de base, migrations et seeds
│   │   ├── test/                 # Tests unitaires et d'intégration (Testcontainers)
│   │   └── Dockerfile
│   └── web/                      # Frontend React + TypeScript + Vite + Tailwind
│       ├── src/
│       │   ├── components/       # UI Components (Monaco Editor, terminaux, PV bars)
│       │   ├── pages/            # Vues : Accueil, Défis, Éditeur, Équipes, Profil, Admin
│       │   ├── hooks/            # Hooks personnalisés (WebSocket, WebRTC, Yjs)
│       │   └── stores/           # Gestion d'état global (Zustand)
│       └── Dockerfile
├── services/
│   ├── runner/                   # Moteur d'exécution sandboxé (gVisor / Firecracker / Isolate)
│   │   ├── src/                  # Consommateur de file de jobs (BullMQ/Redis)
│   │   ├── runtimes/             # Images minimales d'exécution (Python, Node.js)
│   │   └── Dockerfile
│   └── assets/                   # Microservice Python de génération d'épreuves dynamiques
│       ├── generator/            # Génération par seed (Pillow, qrcode, stegano)
│       └── Dockerfile
├── infra/
│   ├── docker-compose.yml        # Orchestration locale (API, Web, PG, Redis, MinIO, LiveKit, MailHog)
│   ├── docker-compose.prod.yml   # Configuration durcie pour serveur de production
│   └── nginx/                    # Configuration Reverse Proxy & SSL
├── docs/                         # Spécifications, diagrammes, manuels d'installation
├── .github/
│   └── workflows/                # Pipelines CI/CD (lint, test, build, audit gitleaks)
└── README.md
```

---

## 3. Matrice de Priorisation (MoSCoW)

| Priorité | Périmètre fonctionnel & technique |
| :--- | :--- |
| **Must Have** | Authentification JWT/Refresh, RBAC, défis de tri avec tests cachés et scoring CPU, base PostgreSQL, API REST, interface web avec Monaco Editor, Dockerisation complète, CI/CD, tests automatisés, gestion stricte des secrets. |
| **Should Have** | Gestion des équipes, events limités à 1 essai, défis de débogage et cryptographie avec seed unique, didacticiels et cours, monnaie virtuelle (*Bits*), lore narratif et DA néon. |
| **Could Have** | Combats de Boss multi-phases avec gestion des PV / KO, stéganographie & QR codes, chat textuel, mode Battle Royale par élimination. |
| **Won't Have (v1)**| Chat vocal complexe multi-salons avec enregistrement, paiements en argent réel, application mobile native (reporté post-v1 via Capacitor). |

---

## 4. Feuille de Route & Plan de Réalisation

### Phase 0 : Fondations & Environnement Technique
> **Objectif** : Mettre en place le socle de développement, le dépôt, la base de données et l'authentification sécurisée.

- [ ] **Initialisation du dépôt**
  - [ ] Configuration du monorepo (npm/pnpm workspaces ou Nx/Turborepo).
  - [ ] Mise en place de la convention de commits (*Conventional Commits*) et de linter/formatter (ESLint, Prettier).
  - [ ] Configuration `.gitignore`, `.env.example` et analyse de secrets pré-commit (Gitleaks).
- [ ] **Infrastructure locale avec Docker Compose**
  - [ ] Service PostgreSQL 16 avec initialisation des volumes persistants.
  - [ ] Service Redis (cache, sessions, files de tâches).
  - [ ] Service MinIO (stockage S3 pour images et assets).
  - [ ] Service MailHog (interception des e-mails en développement).
- [ ] **Modèle de données & Authentification (`apps/api`)**
  - [ ] Définition du schéma initial de BDD (tables `users`, `roles`, `permissions`, `sessions`, `password_reset_tokens`).
  - [ ] Hachage sécurisé des mots de passe avec **Argon2id**.
  - [ ] Implémentation du flux JWT court (15 min) + Refresh token opaque en rotation (30 jours) via cookies `HttpOnly` / `SameSite=Lax`.
  - [ ] Envoi d'e-mail de confirmation et réinitialisation de mot de passe (jeton unique 1h).
  - [ ] Système d'autorisations RBAC avec décorateurs et guards NestJS.
- [ ] **Design System & Socle Frontend (`apps/web`)**
  - [ ] Initialisation React + Vite + Tailwind CSS (thème rétro-futuriste sombre "terminal néon").
  - [ ] Intégration du composant Monaco Editor.
  - [ ] Pages de connexion, inscription, réinitialisation de mot de passe et tableau de bord profil.
- [ ] **Pipeline CI initial (`.github/workflows/ci.yml`)**
  - [ ] Lint, vérification TypeScript, build des conteneurs.

---

### Phase 1 : MVP – Défis de Tri & Bac à Sable d'Évaluation
> **Objectif** : Disposer de la boucle centrale fonctionnelle : soumettre un algorithme de tri, l'exécuter de façon étanche et calculer le score.

- [ ] **Microservice Runner (`services/runner`)**
  - [ ] Mise en place d'une file d'attente (BullMQ / Redis).
  - [ ] Intégration du bac à sable d'exécution éphémère (sans accès réseau, filesystem en lecture seule, cgroups CPU/mémoire, seccomp).
  - [ ] Prise en charge des langages cibles (Python 3 et JavaScript/Node.js).
  - [ ] Mesure précise du **temps CPU** (et non temps mural) sur 5 exécutions successives avec calcul de la médiane.
- [ ] **Moteur d'évaluation & Scoring (`apps/api`)**
  - [ ] Formule de calcul : $\text{Score} = \text{Points\_base} + \text{Points\_perf}$ avec normalisation clampée entre $t_{opt}$ et $t_{max}$.
  - [ ] Chiffrement des jeux de tests cachés et des solutions de référence (**AES-256-GCM**).
  - [ ] Notification en temps réel des résultats de soumission par WebSocket.
- [ ] **Gestion des Défis & Leaderboards**
  - [ ] Schéma BDD : `challenges`, `challenge_versions`, `submissions`, `best_scores`.
  - [ ] Classement en temps quasi-réel via Redis (`ZSET`) et synchronisation PostgreSQL.
- [ ] **Interface Utilisateur MVP (`apps/web`)**
  - [ ] Catalogue des défis de tri avec filtres par difficulté et statut.
  - [ ] Espace de résolution : consigne, éditeur de code Monaco, console de sortie et d'erreurs, barre de progression des tests.
  - [ ] Page de classement global des joueurs.
- [ ] **Back-office Administrateur**
  - [ ] Interface CRUD pour créer/éditer des défis et calibrer automatiquement $t_{opt} / t_{max}$ avec la solution de référence.

---

### Phase 2 : Didacticiels, Débogage & Collaboration d'Équipe
> **Objectif** : Enrichir le contenu pédagogique et introduire le travail collaboratif en temps réel.

- [ ] **Didacticiels & Arbre de compétences**
  - [ ] Tables `lessons`, `lesson_progress`, `challenge_prerequisites`.
  - [ ] Validation des prérequis sous forme de graphe orienté acyclique (DAG).
  - [ ] Interface de cours interactif (leçon théorique, mini-quiz).
- [ ] **Nouveaux types de défis**
  - [ ] *Défis de débogage* : code pré-rempli avec anomalies, décompte du nombre de lignes modifiées.
  - [ ] *Défis de décryptage* : génération dynamique du texte chiffré et de la clé par graine (*seed*) pour chaque participant.
- [ ] **Module Équipes**
  - [ ] Création d'équipe (2 à 5 joueurs), invitation, rôles (Capitaine / Membres).
  - [ ] Édition de code collaborative en temps réel via **Yjs (CRDT)** et WebSockets (curseurs colorés, synchronisation des modifications).
  - [ ] Règle de soumission officielle par le capitaine et calcul du score de contribution individuel.
- [ ] **Système d'Events temporaires**
  - [ ] Plage horaire stricte, compte à rebours, **1 seul essai définitif**.
  - [ ] Classement dédié à l'événement et verrouillage des corrigés jusqu'à la clôture.

---

### Phase 3 : Gamification Poussée, Boss & Économie Virtuelle
> **Objectif** : Installer l'univers narratif, les combats de boss et le système d'économie.

- [ ] **Système de Points de Vie (PV) & Boss**
  - [ ] Modèle `player_health` (100 PV max, régénération passive de 1 PV / 6 min, état KO pendant 30 min).
  - [ ] Tables `bosses`, `boss_phases` : boss découpé en plusieurs sous-épreuves successives.
  - [ ] Décrémentation des PV du boss selon le score obtenu ; perte de PV du joueur en cas de soumission erronée.
  - [ ] Mutualisation des PV en pool d'équipe lors d'un raid sur un boss.
- [ ] **Économie Virtuelle (*Bits*) & Boutique**
  - [ ] Implémentation d'un registre de transactions immuable (*ledger*) avec clé d'idempotence (`transactions`, `wallets`).
  - [ ] Boutique cosmétique et utilitaire non compétitive (potions de régénération de PV, avatars, thèmes d'éditeur, indices pour le mode solo).
  - [ ] Désactivation automatique de l'achat d'indices lors des events compétitifs.
- [ ] **Lore, Ambiance & Audio**
  - [ ] Déblocage des chapitres narratifs du lore au fil de la progression.
  - [ ] Intégration audio (Web Audio API) : musiques d'ambiance par zone, effets sonores (succès, KO, dégâts de boss), respect strict de l'autoplay navigateur et options d'accessibilité.

---

### Phase 4 : Défis Avancés, Battle Royale & Communication
> **Objectif** : Implémenter les épreuves visuelles complexes et les mécaniques compétitives avancées.

- [ ] **Microservice d'Assets Visuels (`services/assets`)**
  - [ ] Service Python avec Pillow, qrcode et stegano.
  - [ ] *Stéganographie* : injection et extraction de texte caché dans les images (LSB, canaux, métadonnées).
  - [ ] *QR Codes* : génération de QR codes partiellement altérés ou dissimulés avec validation du décodage.
  - [ ] Mode « Atelier » inversé : l'étudiant doit dissimuler lui-même l'information conformément à un cahier des charges.
- [ ] **Mode Battle Royale de Code**
  - [ ] Gestionnaire de rounds synchronisés par horloge serveur (`battle_rounds`, `round_results`).
  - [ ] Élimination progressive à chaque manche du/des score(s) le(s) plus faible(s).
  - [ ] Bascule automatique des joueurs éliminés vers le mode spectateur avec chat dédié.
- [ ] **Chat Textuel & Vocal**
  - [ ] Canaux textuels par équipe et par événement avec rate-limiting et filtres de modération.
  - [ ] Déploiement du serveur SFU **LiveKit** pour les salons vocaux d'équipe WebRTC (Push-to-talk, sans enregistrement).
- [ ] **Optimisation PWA & Mobile**
  - [ ] Manifest PWA, service workers pour la consultation hors-ligne des cours.
  - [ ] Clavier virtuel à symboles programmation (`{ } [ ] ; = ->`) pour Monaco Editor sur écran tactile.

---

### Phase 5 : Sécurité, Tests de Charge & Déploiement Final
> **Objectif** : Valider la robustesse, la conformité légale et les performances sous forte charge.

- [ ] **Campagne de Tests Approfondis**
  - [ ] Tests de non-régression « Golden Tests » sur le moteur de scoring et le runner.
  - [ ] Tests de bout en bout (E2E) avec **Playwright** (parcours inscription $\rightarrow$ didacticiel $\rightarrow$ défi $\rightarrow$ score).
  - [ ] Tests de charge avec **k6** (simulation de 500 connexions WebSocket simultanées et pics de soumission à 100/min).
- [ ] **Audit de Sécurité & Pentesting**
  - [ ] Tests d'évasion de sandbox (tentative d'accès au socket Docker hôte, scans réseau internes, fork bombs, saturation mémoire).
  - [ ] Audit automatisé OWASP ZAP (XSS, injections SQL, contrôle d'accès brisé, CSRF).
  - [ ] Audit d'accessibilité via **axe-core** (conformité WCAG 2.1 AA).
- [ ] **Mise en Production & Monitoring**
  - [ ] Configuration de métriques Prometheus et tableaux de bord Grafana.
  - [ ] Configuration des alertes sur files de jobs bloquées et taux d'erreurs HTTP 5xx.
  - [ ] Sauvegardes automatisées de PostgreSQL et tests de procédure de restauration.

---

## 5. Guide de Démarrage Rapide (Environnement Dev)

### Prérequis
* Docker & Docker Compose (v2.20+)
* Node.js 20 LTS & npm / pnpm
* Python 3.11+ (pour le service assets)

### Instructions de lancement
```bash
# 1. Cloner et configurer l'environnement
cp .env.example .env

# 2. Démarrer les services d'infrastructure
docker compose up -d postgres redis minio mailhog

# 3. Installer les dépendances du monorepo
npm install

# 4. Appliquer les migrations de base de données
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api

# 5. Démarrer les applications en mode développement
npm run dev
```

---

## 6. Risques Majeurs & Stratégies de Mitigation

| Risque | Impact | Stratégie d'atténuation |
| :--- | :--- | :--- |
| **Évasion de la sandbox (exécution de code)** | Critique | Utilisation de gVisor/Firecracker, isolation réseau absolue, pas de root, exclusion de tous les volumes hôtes. |
| **Mesures de temps instables / injustes** | Élevé | Temps CPU isolé (cgroups), médiane de 5 runs, tolérance de $\pm 5\%$, calibrage systématique sur la même machine. |
| **Triche et partage de solutions** | Modéré | Instances de tests avec seeds aléatoires par étudiant, rotation des variables, détection de similarité AST. |
| **Complexité excessive (Vocal + Yjs + Battle Royale)** | Élevé | Respect strict de la priorisation MoSCoW ; ces fonctionnalités sont placées en Phase 4 après validation totale du MVP. |

---

*Document maintenu par l'équipe de développement. À mettre à jour au fil des revues de sprint.*
