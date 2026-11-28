# Changelog

Toutes les versions notables de CodeQuest sont documentées ici. Le format suit SemVer et est
généré depuis les Conventional Commits par `scripts/release.cjs` (T272).

## [0.2.0] - 2026-11-28

### Fonctionnalités

- **web** : afficher des messages de connexion précis
- **us17** : exploiter et superviser la plateforme
- **us16** : jouer et apprendre sur tous les appareils
- **us15** : chat textuel et vocal avec modération
- **us14** : battle royale synchronisée et mode spectateur
- **assets** : livrer les défis de stéganographie et de QR codes (US13)
- **lore** : livrer les chroniques et l'ambiance (US12)
- **economy** : livrer la boutique et les Bits (US11)
- **us10** : boss en phases, points de vie et pool d'équipe
- **us9** : événements à essai unique et résultats (#10)
- **us9** : événements à essai unique et résultats
- **us8** : collaborative team editing and contributions
- **api** : équipes et soumission officielle unique (US8 T149/T150/T153-T157)
- **web** : page de débogage avec essai explicite et quickstart US7 (T147/T148)
- **api** : défis de débogage/décryptage — essai explicite score A5 et instances par graine (US7 T140/T142/T145/T146)
- **assets** : génération déterministe d'instances de décryptage et tests (US7 T141)
- **scoring** : clarification A5 et score de résolution débogage/décryptage (US7 T139/T143/T144)

### Corrections

- **us10** : fige l'horloge avant l'authentification dans le test boss
- **us9** : réinitialise l'horloge entre les scénarios DST
- **us9** : stabilise les scénarios DST et le contrat EventResults
- **us9** : corrige les tests d'intégration en CI
- **us8** : collaborative editing and API integration (#8)
- **us8** : corriger la convergence Yjs et les tests d'integration Pr #8
- **us8** : attach Yjs binding when collaborative doc arrives
- **api** : aligner statuts HTTP des routes équipes (US8)
- **api** : injection explicite de fetch dans InstanceService (US7)

### Performance

- **api** : indexer les requêtes chaudes, scripts k6 et couverture métier (T262-T264)

### Documentation

- finaliser la phase 20 et les rapports de validation
- consigner sécurité, runbooks et guides utilisateur/admin (T265-T267, T273)
- consigner la livraison US17 (PR #19, e08b82b)
- journal de la fusion US16 (PR #17, CI 8/8 verte)
- journal de la fusion US8 — PR #7 et #8 (CI 8/8 verte)
- journal de la fusion US8 — PR #5 (CI 8/8 verte)
- journal de la fusion US7 (PR #3, CI 8/8 verte)

### Divers

- gouvernance, nettoyage et alignement des contrats (T268-T269, T271-T272, T280)

Comparaison : `v0.1.0...v0.2.0`

## [0.1.0] - 2026-11-28

### Fonctionnalités

- **api** : plateforme complète des 17 histoires utilisateur (défis, cours, classements, équipes, événements, boutique, chat, boss, modération, audit).
- **web** : interface React avec parcours critiques E2E sur quatre navigateurs et mode hors ligne PWA.
- **runner** : exécution isolée gVisor des soumissions Python et JavaScript.
- **infra** : sauvegardes vérifiées, métriques de cohérence et alertes Prometheus.

### Performance

- **api** : index Prisma sur les requêtes chaudes et scripts de charge k6.
- **api** : couverture métier portée à 80 % minimum.

### Documentation

- runbooks d’exploitation, manuel utilisateur, guide administrateur et campagnes de sécurité.
