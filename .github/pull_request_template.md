## Objectif

<!-- Décrire le changement et référencer les identifiants Txxxx / USxx. -->

## Portes CI (toutes obligatoires)

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` (tests unitaires)
- [ ] `pnpm build`
- [ ] `pnpm test:integration`
- [ ] E2E quatre navigateurs (`pnpm e2e`) et accessibilité (`pnpm test:a11y`)
- [ ] Sécurité : Gitleaks, campagne d’évasion et baseline ZAP si la surface exposée change

## Revue et fusion

- [ ] 1 approbation de `Moreau-Simon` ; 2 approbations si `contracts/` ou `prisma/schema.prisma` est modifié
- [ ] Aucun secret, test caché ni solution de référence dans le diff
- [ ] Fusion en commit de merge via l’API GitHub, après CI verte
- [ ] Suppression de la branche source après fusion

## Validation manuelle

<!-- Commandes exécutées, résultats E2E/couverture/charge, captures si pertinent. -->
