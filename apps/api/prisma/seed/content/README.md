# Catalogue de contenu CodeQuest

Ce dossier contient **tout le contenu durable** de la plateforme : lore, thèmes,
leçons, défis, indices, saisons, événements, boss, boutique et badges. Les
données sont déclaratives et ne dépendent ni de Prisma ni de l'environnement :
elles peuvent donc être validées par des tests unitaires sans base de données.

## Organisation

```text
content/
├── types.ts                 # contrats de données (aucune dépendance externe)
├── catalog.ts               # point d'entrée : CATALOG
├── index.ts                 # exports publics
├── lore/chapters.ts         # 12 chapitres en 4 arcs
├── themes.ts                # 10 provinces de la Grille
├── courses/lessons.ts       # 30 leçons avec mini-quiz pédagogique
├── challenges/
│   ├── cases.ts             # 16 familles de cas déterministes + solutions
│   ├── templates.ts         # énoncés FR et indices par famille
│   ├── buggy.ts             # codes volontairement fautifs (débogage)
│   ├── definitions.ts       # 52 définitions (permanentes, événements, boss)
│   ├── hints.ts             # indices dérivés, jamais sur `sorting`
│   └── index.ts
├── events.ts                # 4 saisons et 8 événements (dont 3 royales)
├── bosses.ts                # 4 boss × 3 phases, parts de barre = 100
├── economy/
│   ├── shop.ts              # 34 objets non compétitifs
│   └── badges.ts            # 20 succès évaluables côté serveur
└── prerequisites.ts         # graphe acyclique de prérequis
```

Les écritures Prisma correspondantes vivent dans `../loaders/` : un loader par
domaine, avec un upsert sur une clé naturelle (`slug`, `sku`, `key`,
`(challengeId, order)`, `(eventId, roundNumber)`, `(bossId, order)`). Le
séquencement est dans `../index.ts` (lore → saisons → thèmes → leçons → défis →
indices → prérequis → événements → boss → boutique/badges).

## Ajouter ou modifier du contenu

1. **Une leçon, un chapitre, un objet, un badge** : ajoutez une entrée dans le
   fichier du domaine. Les clés (`slug`, `sku`, `key`) doivent rester stables :
   les renommer revient à créer une nouvelle entité lors du prochain seed.
2. **Un défi permanent** : ajoutez une `ChallengeDefinition` dans
   `challenges/definitions.ts` avec une famille existante (`cases.ts`). Pour
   une nouvelle famille, fournissez simultanément :
   - `casesFor()` : cas déterministes, nommés, avec une partie cachée ;
   - `solutionFor()` : solution de référence Python ;
   - `statementFor()` et `hintsFor()` : énoncé et indices en français ;
   - `buggyCodeFor()` uniquement si le type est `debugging`.
3. **Modifier les tests d'un défi publié** : ne réécrivez jamais une version
   existante. Changez le contenu dans `cases.ts` : le loader détecte la
   différence, crée une version immuable supplémentaire et met à jour
   `challenge.currentVersion`. Les soumissions passées restent rattachées à
   leur version d'origine (FR-087).
4. **Les indices** : ils sont générés depuis `templates.ts`. Le type `sorting`
   en est exclu (politique `hint.policy.ts`). Les objets `hint` de la boutique
   référencent `(challengeSlug, order)` ; le loader résout l'identifiant réel
   dans `metadata.hintId`.
5. **Un événement ou un boss** : vérifiez que les slugs de défis référencés
   existent, que `maxAttempts = 1`, que le fuseau est un identifiant IANA validé
   par `Intl`, et que les parts de barre totalisent 100.

## Garde automatique

`apps/api/test/unit/seed-catalog.spec.ts` vérifie, sans base de données :

- les volumes minimum (10 thèmes, 12 chapitres, 30 leçons, 52 défis, 16 cas
  par défi, 8 événements, 4 boss, 30+ objets, 20 badges) ;
- l'unicité des clés naturelles et des ordres contigus ;
- les contraintes SQL (difficulté 1–5, langages non vides, `tOptMs < tMaxMs`,
  indice interdit sur `sorting`, types de boutique autorisés) ;
- la résolution de toutes les références (thèmes, leçons, lore, défis, indices)
  et l'absence de cycle dans les prérequis ;
- la cohérence temporelle des saisons et la somme des `hpShare` par boss.

Lancez-la avant toute modification :

```bash
corepack pnpm --filter @codequest/api test -- --runTestsByPath test/unit/seed-catalog.spec.ts
```

Pour rejouer le seed complet (idempotent) :

```bash
corepack pnpm --filter @codequest/api prisma:seed
```
