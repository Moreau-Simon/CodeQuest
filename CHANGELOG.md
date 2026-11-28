# Changelog

Toutes les versions notables de CodeQuest sont documentées ici. Le format suit SemVer et est
généré depuis les Conventional Commits par `scripts/release.cjs` (T272).

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
