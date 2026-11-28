# Feature Specification: Plateforme CodeQuest — défis informatiques et compétition

**Feature Branch**: `001-codequest-platform`

**Created**: 2026-11-13

**Status**: Draft

**Input**: User description: "Spécifier l'intégralité de la plateforme CodeQuest (toutes les phases), en s'appuyant sur PLAN_DE_REALISATION.md et sur la Spécification fonctionnelle et technique v1.0 (23 octobre 2026)."

## Clarifications

### Session 2026-11-13

- Q: Comment le score d'équipe doit-il être calculé à partir des résultats de ses membres ? → A: Soumission officielle unique — seul le dernier résultat officiel retenu par le capitaine compte, sans agrégation des scores des membres.
- Q: À quel instant le chronomètre de résolution doit-il démarrer pour les défis chronométrés et pour un event à essai unique ? → A: Au démarrage explicite de l'essai par le joueur (confirmation), et non à l'ouverture de la page ni à la première soumission.
- Q: Quelles actions un compte doit-il pouvoir effectuer avant d'avoir confirmé son adresse e-mail ? → A: Lecture seule des contenus publics (lore public, classements), avec renvoi du lien de confirmation ; aucune soumission, équipe, messagerie, boutique ni event.
- Q: Combien de participants doivent être éliminés à la fin de chaque manche de battle royale ? → A: Une élimination par manche jusqu'à 50 participants restants, puis 10 % des participants restants (arrondi supérieur) par manche.
- Q: Sur quels types de défis un joueur doit-il pouvoir acheter des indices avec ses Bits ? → A: Défis d'exploration uniquement (débogage, décryptage, stéganographie, QR codes) en solo ; jamais sur les défis de tri, les events ou les boss, et jamais de révélation des tests cachés ni de la solution de référence.

### Session 2026-11-19

- Q: (A5) Comment cadrer le temps de résolution et les pénalités des défis de débogage/décryptage (FR-038, FR-039) ? → A: Le chrono démarre au `start` explicite et s'arrête au verdict `passed` ; sans verdict `passed`, il court jusqu'à `attempt.expiredAt` (abandon). La durée retenue est plafonnée à `t_max_ms`. Le bonus de temps n'est accordé que si `modified_lines` respecte la limite configurée ; au-delà, le bonus est perdu et chaque ligne excédentaire retire 2 % de `base_points` (plafonné à 50 %). Chaque indice consommé retire 10 % de `base_points` (plafonné à 50 %). Une seule tentative par défi est autorisée en v1 : une demande de tentative multiple est rejetée, sans pénalité numérique.

## User Scenarios & Testing *(mandatory)*

<!--
  Les histoires sont ordonnées par priorité de livraison. Chacune est une tranche
  indépendamment testable : la P1 seule constitue un MVP viable (compte + défi de tri
  noté + classement + administration du contenu).
-->

### User Story 1 - Créer un compte et gérer sa session en sécurité (Priority: P1)

Un visiteur s'inscrit avec un e-mail, un pseudo unique et un mot de passe robuste,
confirme son adresse, se connecte, retrouve ses sessions actives, réinitialise son mot de
passe s'il l'oublie, et peut supprimer son compte avec un effacement conforme.

**Why this priority**: Sans identité fiable et sans session maîtrisée, aucun score,
classement, achat ou action d'administration n'a de valeur. C'est le socle de tout le
reste et la première exigence « Must » du projet.

**Independent Test**: Créer un compte, confirmer l'e-mail, se connecter depuis deux
appareils, révoquer une session, demander puis utiliser un lien de réinitialisation, puis
supprimer le compte — chaque étape est vérifiable seule via l'interface et le journal
d'audit.

**Acceptance Scenarios**:

1. **Given** un visiteur non inscrit, **When** il soumet un pseudo déjà pris ou un mot de
   passe de moins de 12 caractères, **Then** l'inscription est refusée avec un message
   explicite et aucun compte n'est créé.
2. **Given** un compte non confirmé, **When** il tente d'accéder à un défi, **Then**
   l'accès est refusé et un renvoi du lien de confirmation est proposé, alors que la
   consultation du lore public et des classements reste possible.
3. **Given** un compte confirmé, **When** il se connecte avec un mauvais identifiant,
   **Then** le message d'erreur est générique et ne révèle pas si l'e-mail ou le pseudo
   existe.
4. **Given** cinq échecs de connexion consécutifs, **When** une nouvelle tentative
   arrive, **Then** le compte est temporairement bloqué selon un délai progressif.
5. **Given** un utilisateur authentifié sur deux appareils, **When** il change son mot de
   passe, **Then** toutes les autres sessions sont révoquées.
6. **Given** un utilisateur qui demande une réinitialisation pour une adresse inconnue,
   **When** la demande est traitée, **Then** la réponse est identique à celle d'une
   adresse connue et aucun compte n'est créé.
7. **Given** un utilisateur qui confirme la suppression de son compte, **When** la
   suppression logique est appliquée, **Then** le compte devient inaccessible
   immédiatement, ses scores restent visibles sous une identité anonymisée et
   l'effacement définitif intervient après 30 jours.

---

### User Story 2 - Résoudre un défi de tri et obtenir un score équitable (Priority: P1)

Un joueur parcourt le catalogue, ouvre un défi de tri, lit l'énoncé, écrit sa solution dans
un éditeur avec coloration syntaxique, la soumet, voit ses tests passer ou échouer, puis
reçoit un score fondé sur la correction et la performance d'exécution.

**Why this priority**: C'est la boucle de valeur centrale du produit. Sans elle, il n'y a
ni compétition, ni classement, ni progression.

**Independent Test**: Publier un défi de tri avec tests visibles et cachés, soumettre une
solution correcte lente, une solution correcte optimale et une solution incorrecte, et
vérifier que les trois produisent respectivement une validation avec faible bonus, une
validation avec bonus maximal et un échec sans score.

**Acceptance Scenarios**:

1. **Given** un défi publié avec tests visibles et cachés, **When** le joueur soumet un
   code qui échoue à un seul test, **Then** la soumission est marquée en échec, aucun
   score de performance n'est attribué et le meilleur score précédent est conservé.
2. **Given** une solution correcte, **When** elle est exécutée, **Then** le score affiché
   combine des points de base liés à la difficulté et un bonus de performance borné, et
   aucun score négatif ou supérieur au maximum n'est possible.
3. **Given** la même solution soumise deux fois, **When** les mesures sont comparées,
   **Then** l'écart de score reste dans la tolérance annoncée.
4. **Given** une soumission en cours d'exécution, **When** le joueur attend le résultat,
   **Then** le verdict lui est poussé sans qu'il ait à recharger la page, avec un repli
   par interrogation périodique si le temps réel est indisponible.
5. **Given** un code qui boucle indéfiniment ou tente d'accéder au réseau, **When** il est
   exécuté, **Then** l'exécution est interrompue par un délai maximal dur, le joueur reçoit
   un motif d'échec et aucun autre composant de la plateforme n'est affecté.
6. **Given** un code qui tente de lire un fichier de la plateforme ou d'écrire hors de son
   espace temporaire, **When** il est exécuté, **Then** l'accès est refusé et la tentative
   est journalisée comme un abus.

---

### User Story 3 - Consulter les classements (Priority: P1)

Un joueur consulte le classement global, par thématique, par saison et par événement, avec
des filtres par période et par équipe, et voit sa position évoluer peu après chaque
soumission retenue.

**Why this priority**: Le classement matérialise la compétition ; sans lui, le score reste
une donnée privée sans effet motivant.

**Independent Test**: Faire soumettre trois joueurs avec des scores distincts, vérifier
l'ordre, le départage à score égal (soumission la plus ancienne devant), puis l'effet des
filtres de période et de thématique.

**Acceptance Scenarios**:

1. **Given** plusieurs joueurs avec des scores différents, **When** le classement global
   est consulté, **Then** les joueurs sont ordonnés par meilleur score décroissant.
2. **Given** deux joueurs à score identique, **When** le classement est calculé, **Then**
   celui dont la soumission retenue est la plus ancienne est classé devant.
3. **Given** une nouvelle soumission retenue, **When** le classement est rechargé,
   **Then** la position est à jour en quelques secondes.
4. **Given** un filtre par thématique et par période, **When** le classement est affiché,
   **Then** seuls les scores correspondant aux deux filtres sont pris en compte.
5. **Given** un classement reconstruit depuis les données définitives, **When** il est
   comparé au classement temps réel, **Then** les deux concordent.

---

### User Story 4 - Administrer le contenu et les utilisateurs (Priority: P1)

Un administrateur crée et versionne des défis, vérifie qu'ils sont solvables et
correctement calibrés avant publication, gère les thématiques et les prérequis, administre
les utilisateurs et les rôles, traite les signalements et consulte un journal d'audit.

**Why this priority**: Sans back-office, aucun contenu ne peut être publié ni corrigé, et
les rôles ne peuvent pas être attribués — le produit reste vide.

**Independent Test**: Depuis une plateforme vierge, créer un défi avec sa solution de
référence, le publier, vérifier qu'il est jouable, modifier son énoncé en créant une
nouvelle version, puis consulter les entrées du journal d'audit correspondantes.

**Acceptance Scenarios**:

1. **Given** un défi en brouillon, **When** l'administrateur le soumet à validation,
   **Then** la solution de référence est exécutée, les tests sont vérifiés et les bornes
   de performance sont calibrées avant toute publication.
2. **Given** un défi dont un test échoue pour la solution de référence, **When** la
   validation est lancée, **Then** la publication est bloquée avec le test fautif identifié.
3. **Given** un défi publié, **When** l'administrateur modifie son énoncé, **Then** une
   nouvelle version est créée et les scores existants restent rattachés à leur version.
4. **Given** un utilisateur promu modérateur, **When** il ouvre une action
   d'administration réservée aux administrateurs, **Then** l'accès est refusé côté serveur.
5. **Given** une action d'administration ou un changement de rôle, **When** elle est
   réalisée, **Then** une entrée d'audit horodatée, attribuée et non modifiable est créée.
6. **Given** un signalement de message, **When** un modérateur le traite, **Then** la
   sanction appliquée est journalisée et notifiée au joueur concerné.

---

### User Story 5 - Explorer les défis par thématique et prérequis (Priority: P1)

Un joueur filtre le catalogue par thématique, difficulté, type et statut, et voit pour
chaque défi verrouillé ce qui lui manque pour le débloquer.

**Why this priority**: La progression guidée est une exigence « Must » ; sans prérequis
visibles, les joueurs se dispersent et le parcours pédagogique est rompu.

**Independent Test**: Créer deux défis dont le second exige la réussite du premier,
vérifier que le second est verrouillé avec un motif explicite, puis le débloquer après
réussite du premier.

**Acceptance Scenarios**:

1. **Given** un défi sans prérequis, **When** le catalogue est affiché, **Then** il est
   marqué disponible.
2. **Given** un défi dont le prérequis n'est pas rempli, **When** le joueur l'ouvre,
   **Then** l'accès est refusé et le prérequis manquant est nommé.
3. **Given** un prérequis satisfait par un niveau, un cours ou un chapitre de lore,
   **When** la condition est remplie, **Then** le défi devient disponible sans action
   manuelle de l'administrateur.
4. **Given** un cycle de prérequis (A exige B et B exige A), **When** l'administrateur
   tente de l'enregistrer, **Then** la configuration est refusée.

---

### User Story 6 - Suivre un cours et progresser dans un parcours (Priority: P2)

Un joueur suit une leçon courte, passe un mini-quiz, termine par un défi d'application et
gagne de l'expérience.

**Why this priority**: La promesse « apprendre par la pratique » dépend du contenu
pédagogique, mais le MVP peut exister sans lui.

**Independent Test**: Suivre une leçon, échouer puis réussir le quiz, constater la
progression enregistrée et le déblocage du défi d'application.

**Acceptance Scenarios**:

1. **Given** un cours non suivi, **When** le joueur ouvre le premier défi de la notion,
   **Then** le cours associé lui est proposé comme obligatoire.
2. **Given** un quiz réussi, **When** le joueur revient plus tard, **Then** sa progression
   est conservée et le défi d'application est débloqué.
3. **Given** un défi réussi, **When** l'expérience est attribuée, **Then** le niveau du
   joueur est recalculé et les zones de lore conditionnées par ce niveau s'ouvrent.

---

### User Story 7 - Résoudre des défis de débogage et de décryptage (Priority: P2)

Un joueur corrige un code contenant des bugs, ou décrypte un texte chiffré généré
spécifiquement pour lui à partir d'une graine, et obtient un score tenant compte du nombre
d'essais et du temps de résolution.

**Why this priority**: Ces variantes enrichissent l'offre au-delà du tri, mais le tri seul
suffit à valider le MVP.

**Independent Test**: Ouvrir un défi de débogage, corriger le bug, vérifier la réussite et
le décompte des lignes modifiées ; ouvrir un défi de décryptage, vérifier que deux joueurs
reçoivent des textes différents et que la bonne réponse de l'un est refusée pour l'autre.

**Acceptance Scenarios**:

1. **Given** un défi de débogage à bug unique, **When** le joueur corrige le bug et soumet,
   **Then** la suite de tests cachée passe et le score reflète essais et temps de
   résolution.
2. **Given** un défi de débogage avec bonus de lignes modifiées, **When** le joueur dépasse
   le nombre autorisé, **Then** la soumission reste valide mais le bonus n'est pas accordé,
   et le motif est affiché.
3. **Given** deux joueurs différents sur un défi de décryptage, **When** ils ouvrent le
   défi, **Then** chacun reçoit une instance différente et une clé différente.
4. **Given** un texte clair correct mais provenant de l'instance d'un autre joueur,
   **When** il est soumis, **Then** il est refusé.

---

### User Story 8 - Former une équipe et coder à plusieurs en temps réel (Priority: P2)

Un joueur crée une équipe, invite des membres, choisit un capitaine, et plusieurs membres
éditent le même code simultanément avec curseurs visibles ; le capitaine déclenche la
soumission officielle qui compte pour l'équipe.

**Why this priority**: Le travail d'équipe et l'édition collaborative sont une exigence
« Should », structurante mais non nécessaire au MVP individuel.

**Independent Test**: Créer une équipe de trois membres, ouvrir le même défi sur deux
navigateurs, vérifier la synchronisation des frappes et des curseurs, puis soumettre
officiellement et vérifier qu'un seul score d'équipe est enregistré.

**Acceptance Scenarios**:

1. **Given** une équipe de 2 à 5 membres, **When** un sixième joueur rejoint, **Then** la
   demande est refusée avec la limite affichée.
2. **Given** deux membres sur le même défi, **When** l'un tape du code, **Then** l'autre
   voit la modification et son curseur en moins d'une seconde.
3. **Given** des essais individuels non officiels, **When** le capitaine soumet la version
   officielle, **Then** seul ce dernier résultat officiel compte pour le classement
   d'équipe et les scores individuels des membres ne sont ni additionnés ni moyennés.
4. **Given** un membre qui quitte l'équipe, **When** il retente le défi, **Then** il ne
   peut plus contribuer au défi en cours mais les scores déjà acquis restent acquis.
5. **Given** un capitaine qui supprime son compte, **When** la suppression est appliquée,
   **Then** la capitainerie est transférée automatiquement et l'équipe reste fonctionnelle.

---

### User Story 9 - Participer à un événement à essai unique (Priority: P2)

Un joueur s'inscrit à un événement planifié, confirme explicitement son unique essai,
résout le défi dans la fenêtre temporelle, puis consulte le classement et les corrigés
après la clôture.

**Why this priority**: Les événements créent le rendez-vous compétitif, mais peuvent être
livrés après le socle solo.

**Independent Test**: Planifier un événement d'une heure, inscrire deux joueurs, faire
consommer un essai puis fermer la fenêtre, vérifier le classement publié et le déblocage
du corrigé.

**Acceptance Scenarios**:

1. **Given** un événement planifié hors de sa fenêtre, **When** un joueur l'ouvre,
   **Then** seul un aperçu « à venir » ou « terminé » est visible selon le cas.
2. **Given** un joueur qui confirme son essai, **When** il ferme le navigateur, **Then**
   l'essai est consommé et ne peut pas être repris.
3. **Given** un joueur qui tente une seconde soumission sur le même événement, **When** il
   soumet, **Then** la soumission est refusée.
4. **Given** un événement clôturé, **When** les résultats sont publiés, **Then** le
   classement dédié est figé et les corrigés deviennent consultables.

---

### User Story 10 - Affronter un boss et gérer ses points de vie (Priority: P3)

Un joueur engage un boss composé de plusieurs phases, perd des points de vie en cas
d'échec, attend la régénération ou utilise une potion, et inflige des dégâts au boss
proportionnels à son score ; en équipe, les points de vie sont mutualisés.

**Why this priority**: C'est le cœur de la gamification narrative, mais elle dépend d'un
moteur de score et d'une économie déjà stables.

**Independent Test**: Configurer un boss à deux phases avec 100 points de vie, échouer une
phase pour constater la perte de PV, tomber à 0 PV pour constater le KO, puis utiliser une
potion et vérifier la reprise.

**Acceptance Scenarios**:

1. **Given** un joueur à 100 PV, **When** il échoue une phase de boss coûtant 15 PV,
   **Then** son solde passe à 85 et le blocage est reflété immédiatement.
2. **Given** un joueur à 0 PV, **When** il tente d'accéder à un boss, **Then** l'accès est
   bloqué jusqu'à la fin du délai de récupération, avec le temps restant affiché.
3. **Given** un joueur KO depuis le délai de récupération, **When** la régénération
   passive s'applique, **Then** ses PV remontent au rythme annoncé sans dépasser le
   maximum.
4. **Given** une équipe en raid, **When** un membre inflige des dégâts ou en subit,
   **Then** le pool de PV d'équipe est mis à jour pour tous les membres.
5. **Given** un boss dont les PV atteignent zéro, **When** la phase finale est réussie,
   **Then** le boss est marqué vaincu et les récompenses sont attribuées une seule fois.

---

### User Story 11 - Gagner et dépenser des Bits (Priority: P3)

Un joueur gagne des Bits en réussissant défis, événements, boss et succès, puis les dépense
dans une boutique d'objets cosmétiques et utilitaires non compétitifs, avec un historique
de transactions infalsifiable.

**Why this priority**: L'économie virtuelle renforce l'engagement, mais n'est utile
qu'une fois le contenu et les boss en place.

**Independent Test**: Créditer un joueur, acheter un objet, rejouer la même requête
d'achat avec la même clé d'idempotence, vérifier qu'un seul débit existe, puis vérifier
que le solde correspond à la somme de l'historique.

**Acceptance Scenarios**:

1. **Given** un défi réussi pour la première fois, **When** la récompense est versée,
   **Then** le joueur reçoit les Bits annoncés une seule fois ; une nouvelle réussite ne
   reverse rien, sauf bonus de record personnel.
2. **Given** un achat avec une clé d'idempotence déjà utilisée, **When** la requête est
   rejouée, **Then** aucun second débit n'est appliqué et la réponse initiale est renvoyée.
3. **Given** un solde insuffisant, **When** un achat est tenté, **Then** l'achat est refusé
   et le solde reste inchangé.
4. **Given** un événement compétitif en cours, **When** un joueur tente d'acheter un
   indice, **Then** l'achat est refusé et le motif est affiché.
5. **Given** un objet cosmétique acheté, **When** le joueur l'équipe, **Then** son score et
   ses performances compétitives restent strictement inchangés.

---

### User Story 12 - Explorer le lore et l'ambiance (Priority: P3)

Un joueur débloque des chapitres narratifs au fil de sa progression, lit son avancement
conservé, et contrôle l'ambiance sonore et les animations selon ses préférences
d'accessibilité.

**Why this priority**: Le lore et la direction artistique donnent son identité au produit
mais ne conditionnent aucune mécanique compétitive.

**Independent Test**: Atteindre le niveau requis, débloquer un chapitre, le lire,
recharger la page et vérifier l'état de lecture conservé ; couper le son et vérifier que
chaque information sonore reste disponible visuellement.

**Acceptance Scenarios**:

1. **Given** un chapitre conditionné par un niveau, **When** le niveau est atteint,
   **Then** le chapitre devient lisible.
2. **Given** un chapitre lu, **When** le joueur revient, **Then** son état de lecture est
   conservé.
3. **Given** une préférence « animations réduites », **When** une validation de défi ou
   une barre de vie s'anime, **Then** l'animation est désactivée sans perte d'information.
4. **Given** un navigateur qui bloque la lecture automatique, **When** le joueur arrive sur
   la plateforme, **Then** aucun son ne démarre avant une interaction explicite.
5. **Given** le son coupé, **When** un succès, un échec ou un KO survient, **Then**
   l'information reste perceptible visuellement.

---

### User Story 13 - Relever des défis de stéganographie et de QR codes (Priority: P4)

Un joueur retrouve un message caché dans une image ou un QR code dissimulé, peut acheter
des indices progressifs, et peut inverser les rôles en mode atelier en cachant lui-même
une information que la plateforme doit retrouver.

**Why this priority**: Ces épreuves visuelles nécessitent une génération d'assets dédiée ;
elles sont classées « Could » et arrivent après le socle compétitif.

**Independent Test**: Générer une image porteuse d'un message pour un joueur, vérifier que
le message n'est pas visible dans le texte brut de l'image, soumettre la bonne réponse,
puis tester le mode atelier inverse.

**Acceptance Scenarios**:

1. **Given** un défi de stéganographie généré, **When** le joueur soumet le message caché
   exact, **Then** le défi est validé.
2. **Given** des indices progressifs payants, **When** le joueur en achète un, **Then** son
   solde est débité et l'indice suivant devient disponible.
3. **Given** un mode atelier, **When** le joueur cache un message conforme au cahier des
   charges, **Then** l'extracteur de référence retrouve le message et valide la soumission.
4. **Given** un QR code partiellement dégradé, **When** le joueur soumet son contenu exact,
   **Then** le défi est validé.

---

### User Story 14 - Participer à une battle royale (Priority: P4)

Un joueur ou une équipe participe à des manches synchronisées par le serveur, un seul essai
par manche, et les participants au score le plus faible sont éliminés jusqu'à ce qu'il
reste un vainqueur ; les éliminés passent spectateurs.

**Why this priority**: Mécanique la plus complexe du produit, explicitement placée en phase
tardive car elle dépend d'un temps réel stable.

**Independent Test**: Lancer une battle royale avec huit participants répartis sur plusieurs
manches, vérifier l'élimination du score le plus faible, le départage par heure de
soumission, et le passage en mode spectateur.

**Acceptance Scenarios**:

1. **Given** huit participants et une manche ouverte, **When** le compte à rebours commun
   se termine, **Then** la manche est clôturée pour tous au même instant serveur.
2. **Given** un participant qui se déconnecte pendant une manche, **When** la manche se
   termine, **Then** sa soumission éventuelle est prise en compte et la manche n'est pas
   mise en pause.
3. **Given** deux participants au score le plus bas, **When** l'élimination est appliquée,
   **Then** celui qui a soumis le plus tard est éliminé.
4. **Given** un participant éliminé, **When** il revient, **Then** il voit la suite en mode
   spectateur avec le chat dédié, sans pouvoir soumettre.
5. **Given** moins de huit participants à l'heure prévue, **When** le lancement est tenté,
   **Then** l'événement est reporté et les inscrits sont informés.

---

### User Story 15 - Communiquer par chat textuel et vocal (Priority: P4)

Un joueur échange dans des canaux textuels (global, équipe, événement), signale les
messages abusifs, et rejoint un salon vocal d'équipe sans qu'aucun contenu ne soit
enregistré.

**Why this priority**: La communication sociale complète l'expérience mais n'est pas
nécessaire à la compétition ; le vocal est explicitement repoussé en phase tardive.

**Independent Test**: Envoyer un message dans un canal d'équipe, le faire modérer par un
modérateur, vérifier le signalement et la sanction ; rejoindre un salon vocal à deux et
vérifier qu'aucun enregistrement n'est produit.

**Acceptance Scenarios**:

1. **Given** un canal d'équipe, **When** un non-membre tente d'écrire, **Then** l'accès est
   refusé.
2. **Given** un envoi massif de messages, **When** la limite de débit est dépassée,
   **Then** les messages suivants sont refusés temporairement avec un motif clair.
3. **Given** un message signalé, **When** un modérateur le supprime et mute l'auteur,
   **Then** la sanction est journalisée et l'auteur est informé.
4. **Given** deux membres dans un salon vocal, **When** ils parlent, **Then** la voix est
   transmise avec une latence perceptiblement faible et aucun enregistrement n'est créé.
5. **Given** un participant qui a coupé son micro, **When** il reprend la parole,
   **Then** le son n'est pas transmis avant qu'il ne réactive explicitement le micro.

---

### User Story 16 - Jouer et apprendre sur tous les appareils (Priority: P4)

Un joueur installe la plateforme comme application web, consulte les cours déjà chargés
hors ligne, reçoit des notifications d'événement et de fin de KO, et utilise un éditeur
adapté au tactile.

**Why this priority**: L'expérience multi-appareils élargit l'audience mais n'apporte pas de
valeur compétitive nouvelle.

**Independent Test**: Installer l'application, couper le réseau et ouvrir un cours déjà
visité, puis recevoir une notification de fin de KO au retour du réseau.

**Acceptance Scenarios**:

1. **Given** un cours déjà consulté, **When** le joueur est hors ligne, **Then** le cours
   reste lisible et les actions nécessitant le réseau sont clairement indisponibles.
2. **Given** un événement à venir, **When** l'heure approche, **Then** une notification est
   reçue si le joueur l'a autorisée.
3. **Given** un écran tactile étroit, **When** le joueur ouvre l'éditeur, **Then** un
   clavier à symboles de programmation est disponible et l'éditeur peut passer en plein
   écran.
4. **Given** les deux dernières versions des principaux navigateurs, **When** les parcours
   critiques sont exécutés, **Then** ils fonctionnent sans erreur bloquante.

---

### User Story 17 - Exploiter et superviser la plateforme (Priority: P5)

L'équipe d'exploitation suit l'état des files d'exécution, la disponibilité et les erreurs,
est alertée en cas d'incident et peut restaurer une sauvegarde vérifiée.

**Why this priority**: Nécessaire au lancement, mais uniquement après stabilisation
fonctionnelle.

**Independent Test**: Provoquer une file bloquée et une rafale d'erreurs serveur, vérifier
le déclenchement des alertes, puis restaurer une sauvegarde dans un environnement de test
et vérifier l'intégrité des scores.

**Acceptance Scenarios**:

1. **Given** une file d'exécution bloquée au-delà du seuil, **When** l'alerte est évaluée,
   **Then** une alerte est émise avec le nombre de travaux en attente.
2. **Given** une hausse du taux d'erreurs serveur, **When** le seuil est franchi, **Then**
   une alerte est émise et l'incident est traçable.
3. **Given** une sauvegarde quotidienne, **When** une restauration est testée, **Then** les
   scores, comptes et transactions retrouvés sont cohérents.

### Edge Cases

- Un joueur soumet un code volumineux ou une sortie énorme : la taille est bornée et le
  dépassement produit un échec explicite, sans saturer la plateforme.
- Une soumission arrive exactement à l'instant de clôture d'un événement : la règle de
  coupure est déterministe (heure serveur) et communiquée au joueur.
- Deux achats simultanés avec le même solde : un seul aboutit, l'autre échoue proprement.
- Un joueur appartient à deux équipes à la fois à la suite d'une invitation concurrente :
  la règle « une seule équipe active » est garantie.
- Une équipe perd son capitaine (suppression de compte) : transfert automatique, sans
  perte de score.
- Le service de messagerie est indisponible à l'inscription : le compte est créé en état
  non confirmé et le renvoi du lien reste possible.
- Un runner tombe pendant une exécution : le travail est repris ou marqué en échec avec un
  motif, sans double attribution de score.
- Un classement temps réel diverge : la reconstruction périodique le corrige et la
  divergence est détectée.
- Un joueur tente de soumettre pour un autre joueur (ou une autre équipe) : refus et
  journalisation.
- Une image de stéganographie est régénérée pour le même joueur : la seed garantit une
  instance stable pour ce joueur et ce défi.
- Un fuseau horaire d'événement est mal configuré : la validation refuse l'enregistrement
  sans fuseau explicite.
- Un joueur qui ouvre un défi chronométré ou un event sans déclencher explicitement le
  démarrage de l'essai ne consomme ni essai ni temps de résolution.
- Une battle royale dépasse 50 participants : le nombre d'éliminés par manche passe à 10 %
  (arrondi supérieur) et ce nombre est annoncé avant le lancement.
- Un modérateur sanctionne un administrateur : la hiérarchie des rôles empêche l'action.

## Requirements *(mandatory)*

### Functional Requirements

**Comptes, sessions et profils**

- **FR-001**: System MUST allow a visitor to register with an e-mail, a unique pseudonym
  of 3 to 20 characters, and a password of at least 12 characters.
- **FR-002**: System MUST reject passwords found in known compromised-password lists.
- **FR-003**: System MUST send a confirmation e-mail and keep the account read-only for
  public content only (public lore and leaderboards, plus resending the confirmation link)
  until the address is confirmed; submissions, teams, chat, shop, and events MUST remain
  inaccessible.
- **FR-004**: System MUST allow login by e-mail or pseudonym plus password.
- **FR-005**: System MUST return a generic authentication error that does not reveal which
  credential is wrong.
- **FR-006**: System MUST apply progressive temporary lockout after five consecutive failed
  logins.
- **FR-007**: System MUST support password reset through a single-use link valid one hour,
  with an identical response whether or not the address exists.
- **FR-008**: System MUST revoke all active sessions after a password change.
- **FR-009**: System MUST let a user revoke the current session and all sessions at once.
- **FR-010**: System MUST list active sessions with device, date, and approximate location,
  each individually revocable.
- **FR-011**: System MUST keep a session alive with a sliding expiration and require recent
  re-authentication for sensitive actions (password change, account deletion).
- **FR-012**: System MUST require password confirmation before deleting an account, apply
  immediate logical deletion, and purge personal data definitively after 30 days.
- **FR-013**: System MUST anonymize retained scores and messages as "deleted player" after
  account deletion.
- **FR-014**: System MUST transfer team captaincy automatically when a captain deletes
  their account.
- **FR-015**: System MUST let a user maintain a profile with avatar, pseudonym, preferred
  language, sound and theme preferences, history, and badges.
- **FR-016**: System MUST let a user export their personal data.
- **FR-017**: System MUST close any active real-time connection when its underlying session
  is revoked.

**Rôles et permissions**

- **FR-018**: System MUST support cumulative roles with per-role permission sets, including
  the contextual team-captain role.
- **FR-019**: System MUST enforce every permission on the server for every exposed
  operation, denying by default when no permission is declared.
- **FR-020**: System MUST prevent a user from granting themselves a role or permission.

**Catalogue, thématiques et prérequis**

- **FR-021**: System MUST organize challenges by theme, with secondary tags, a difficulty
  level from 1 to 5, a type, and a status (locked, available, completed).
- **FR-022**: System MUST let a player filter and sort the catalogue by theme, difficulty,
  status, and type.
- **FR-023**: System MUST support prerequisites expressed as required challenges, minimum
  level, completed lesson, or reached lore chapter.
- **FR-024**: System MUST represent prerequisites as an acyclic graph and reject any
  configuration that creates a cycle.
- **FR-025**: System MUST show, for each locked challenge, the precise unmet prerequisite.

**Défis de tri et exécution**

- **FR-026**: System MUST support sorting challenges in at least two programming languages
  for v1.
- **FR-027**: System MUST execute each submitted solution in an isolated, ephemeral
  environment with no network access, a read-only file system except a bounded temporary
  directory, a non-privileged user, and hard limits on CPU, memory, process count, output
  size, and duration.
- **FR-028**: System MUST never send hidden tests or reference solutions to the browser.
- **FR-029**: System MUST mark a challenge as validated only when 100% of its tests pass.
- **FR-030**: System MUST attribute a score composed of challenge base points and a
  performance bonus bounded between zero and a configured maximum.
- **FR-031**: System MUST measure execution time as CPU time, not wall-clock time, and use
  the median of at least five executions.
- **FR-032**: System MUST apply a ±5% tolerance so that non-significant timing differences
  do not change a score.
- **FR-033**: System MUST allow unlimited attempts on standard challenges and retain only
  the best score.
- **FR-034**: System MUST deliver submission verdicts to the client in real time, with a
  polling fallback.
- **FR-035**: System MUST record each submission with its language, code, status, measured
  time, passed tests, and score.
- **FR-036**: System MUST detect and log abuse attempts (forbidden system calls, abnormal
  load, oversized payloads) and apply a sanction when defined.

**Défis de débogage et de décryptage**

- **FR-037**: System MUST provide debugging challenges with one or more hidden bugs and
  evaluate the corrected code against hidden tests.
- **FR-038**: System MUST track the number of modified lines for debugging challenges and
  apply a bonus only when the configured limit is respected.
- **FR-039**: System MUST score debugging and decryption challenges from resolution time,
  number of hints used, and number of attempts, where resolution time starts at the
  player's explicit attempt start and not at page opening or first submission.
- **FR-040**: System MUST generate each decryption instance and its key from a seed unique
  to the player or team, and reject answers belonging to another instance.

**Stéganographie, QR codes et assets**

- **FR-041**: System MUST generate steganography and QR-code challenges from a seed, with a
  stable instance per player and challenge.
- **FR-042**: System MUST provide progressive purchasable hints in solo mode for exploratory
  challenges only (debugging, decryption, steganography, QR codes); hints MUST be
  author-written, MUST NOT reveal hidden tests or reference solutions, and MUST NOT be
  offered on sorting challenges.
- **FR-043**: System MUST support an inverse workshop mode where a player hides a message
  and a reference extractor verifies recoverability.
- **FR-044**: System MUST support QR-code challenges that are overlaid, fragmented,
  low-contrast, partially degraded, or hidden in low-order bits.

**Évaluation, classements et statistiques**

- **FR-045**: System MUST maintain player leaderboards globally, per theme, per season, and
  per event.
- **FR-046**: System MUST maintain team leaderboards from a single officially retained
  team submission per challenge, triggered by the captain, without aggregating or
  averaging the individual scores of team members.
- **FR-047**: System MUST filter leaderboards by period (week, month, season, all time),
  team, and friends.
- **FR-048**: System MUST break score ties in favor of the earliest retained submission.
- **FR-049**: System MUST refresh leaderboards within seconds of a retained submission and
  rebuild them periodically from authoritative data to guarantee consistency.
- **FR-050**: System MUST expose platform statistics to administrators (active users, most
  played challenges, success rate, execution queues).

**Cours, progression et niveaux**

- **FR-051**: System MUST provide one lesson per concept with a short theoretical part,
  interactive examples, and a mini-quiz, ending with an application challenge.
- **FR-052**: System MUST make the lesson mandatory before the first challenge of its
  concept.
- **FR-053**: System MUST persist lesson progress and reading state.
- **FR-054**: System MUST award experience for each successful challenge, recompute the
  player level, and unlock level-gated lore content.

**Équipes et collaboration**

- **FR-055**: System MUST let a player create a team with a unique name, tag, description,
  and logo, and invite members by link or pseudonym.
- **FR-056**: System MUST enforce a configurable team size of 2 to 5 members and allow only
  one active team per player.
- **FR-057**: System MUST support real-time collaborative code editing with visible cursors
  and a shared result console.
- **FR-058**: System MUST let the captain trigger the official submission while other
  members' attempts remain unofficial.
- **FR-059**: System MUST compute an individual contribution score (kept lines, successful
  attempts, assistance) that feeds the player leaderboard with a reduced coefficient.
- **FR-060**: System MUST preserve scores already earned by a team when a member leaves or
  is excluded, while revoking the right to contribute to in-progress challenges.

**Événements**

- **FR-061**: System MUST restrict each event to an explicit date range with an explicit
  time zone, and hide or lock it outside that range.
- **FR-062**: System MUST require explicit confirmation before consuming the single event
  attempt, start the attempt clock at that confirmation, and treat an abandonment or
  browser closure as consumed.
- **FR-063**: System MUST provide a dedicated event leaderboard, rewards, and a lifecycle
  status (draft, scheduled, open, finished, archived).
- **FR-064**: System MUST publish results at closure and unlock solutions afterwards.
- **FR-065**: System MUST enforce at most one attempt per player or team per event at the
  data-integrity level, with no configurable value allowing more than one attempt in v1.

**Boss et points de vie**

- **FR-066**: System MUST model a boss as an ordered set of phases, each being a sub-challenge
  tied to a lore chapter, with its own health bar and rewards.
- **FR-067**: System MUST give each player 100 health points and deduct a configured cost on
  failed boss attempts and on designated hardcore events only.
- **FR-068**: System MUST block boss access while a player is knocked out and display the
  remaining recovery time.
- **FR-069**: System MUST regenerate health passively at the configured rate without
  exceeding the maximum, and allow instant regeneration through a purchased potion.
- **FR-070**: System MUST reduce boss health in proportion to the score obtained and mark
  the boss defeated only once, when its health reaches zero.
- **FR-071**: System MUST share a single health pool across team members during a team raid.

**Économie virtuelle**

- **FR-072**: System MUST award a non-convertible virtual currency for challenges, events,
  bosses, achievements, and connection streaks, with a one-time reward per challenge except
  for personal-record bonuses.
- **FR-073**: System MUST record every currency movement in an immutable, idempotent ledger
  and derive balances from that ledger.
- **FR-074**: System MUST support purchases of hints (exploratory challenges only, in solo
  mode), potions, and cosmetics that do not increase competitive scores.
- **FR-075**: System MUST disable hint purchases during competitive events and boss
  encounters.
- **FR-076**: System MUST prevent duplicate charges when the same purchase request is
  replayed with the same idempotency key.
- **FR-077**: System MUST award badges and achievements for defined milestones.

**Lore, direction artistique et son**

- **FR-078**: System MUST unlock lore chapters through progression and persist their read
  state.
- **FR-079**: System MUST provide per-region ambient music and sound effects with master,
  music, effects, and voice volume controls, plus a global mute.
- **FR-080**: System MUST start no audio before an explicit user interaction.
- **FR-081**: System MUST convey every sound-borne information visually as well.
- **FR-082**: System MUST let users disable animations while preserving all information.

**Administration**

- **FR-083**: System MUST provide a dashboard of active users, most played challenges,
  success rates, and execution queues.
- **FR-084**: System MUST provide create, read, update, and delete operations for
  challenges (with versions), lessons, themes, prerequisites, events, bosses, lore, and shop
  items.
- **FR-085**: System MUST validate a challenge before publication by executing the reference
  solution, verifying all tests, and calibrating performance bounds.
- **FR-086**: System MUST block publication when the reference solution fails any test.
- **FR-087**: System MUST version challenges so that existing scores remain attached to the
  version they were earned on.
- **FR-088**: System MUST let administrators manage users, roles, suspensions, deletions,
  and reports.
- **FR-089**: System MUST record an immutable audit entry for every administrative action
  and role change.
- **FR-090**: System MUST prevent a moderator from sanctioning an administrator or a peer of
  higher rank.

**Chat et modération**

- **FR-091**: System MUST provide textual channels for global, team, and event
  conversations, with history and mentions.
- **FR-092**: System MUST restrict each channel to its legitimate audience.
- **FR-093**: System MUST enforce per-account and per-address rate limiting on chat and
  stricter limits on authentication, reset, and submissions.
- **FR-094**: System MUST let users report messages and let moderators mute, delete, or
  temporarily ban, with every sanction logged.
- **FR-095**: System MUST provide team and event voice rooms without any recording, with
  push-to-talk or voice detection, mute, and per-participant volume.
- **FR-096**: System MUST start voice transmission only after explicit microphone activation.

**Battle royale**

- **FR-097**: System MUST run battle royale rounds synchronized by the server clock with a
  common countdown and one attempt per participant per round.
- **FR-098**: System MUST eliminate the lowest-scoring participant or team at the end of
  each round — one participant per round while at most 50 remain, and 10% of remaining
  participants (rounded up) per round above 50 — breaking ties by latest submission time.
- **FR-099**: System MUST move eliminated participants to a spectator mode with a dedicated
  chat and no submission rights.
- **FR-100**: System MUST not pause a round when a participant disconnects.
- **FR-101**: System MUST require a configured minimum number of participants and postpone
  the event otherwise.

**Multi-appareils, accessibilité et internationalisation**

- **FR-102**: System MUST be responsive and usable on mobile, tablet, and desktop.
- **FR-103**: System MUST be installable as a web application and allow offline reading of
  already-loaded lessons while clearly marking network-dependent actions as unavailable.
- **FR-104**: System MUST send notifications for upcoming events and end of knockout when
  the user has authorized them.
- **FR-105**: System MUST provide a programming-symbol keyboard and a full-screen mode for
  the code editor on touch devices.
- **FR-106**: System MUST meet WCAG 2.1 AA on critical journeys (contrast, keyboard
  navigation, screen readers).
- **FR-107**: System MUST ship in French while keeping all user-facing text externalized
  for future translation.

**Sécurité, confidentialité et exploitation**

- **FR-108**: System MUST transmit all traffic over HTTPS with HSTS and TLS 1.2 or above.
- **FR-109**: System MUST hash passwords with a memory-hard algorithm and store session and
  reset tokens only in hashed form.
- **FR-110**: System MUST encrypt hidden tests and reference solutions at rest with
  application-level encryption and keep keys outside the source repository.
- **FR-111**: System MUST keep secrets out of version control, provide an example
  environment file without real values, and run secret scanning in continuous integration.
- **FR-112**: System MUST apply a strict content security policy, secure and HTTP-only
  cookies, CSRF protection, restricted cross-origin access, output escaping, parameterized
  queries, and standard security headers.
- **FR-113**: System MUST mask passwords, tokens, and e-mail addresses in logs and never log
  sensitive values.
- **FR-114**: System MUST detect suspicious multi-account submissions and code similarity,
  and log the evidence for review.
- **FR-115**: System MUST record consent, minimize collected data, provide access and
  erasure, maintain a processing register, and limit log retention to 12 months.
- **FR-116**: System MUST expose structured logs, metrics, and dashboards, with alerts on
  blocked job queues and server error rate.
- **FR-117**: System MUST back up the database daily and verify restoration at least
  quarterly.
- **FR-118**: System MUST run each service as a non-root user with a health check, and
  provide a reproducible local environment covering all dependencies.

### Key Entities *(include if feature involves data)*

- **User**: a person with credentials, pseudonym, status, profile preferences, level,
  experience, and deletion state.
- **Role / Permission**: named capability sets attached to users, including the contextual
  team-captain role.
- **Session**: an authenticated device, with refresh-token hash, user agent, approximate
  origin, expiry, and revocation state.
- **Reset Token**: a single-use, time-bounded credential for password recovery.
- **Theme**: a thematic domain (sorting, debugging, cryptography, steganography, QR codes,
  bosses) linked to a lore region.
- **Challenge**: a playable exercise with theme, type, difficulty, statement, base points,
  performance bounds, status, and event/boss flags.
- **Challenge Version**: an immutable snapshot of a challenge's statement, hidden tests,
  and reference solution.
- **Prerequisite**: a directed, acyclic dependency between a challenge and a required
  challenge, level, lesson, or lore chapter.
- **Lesson / Lesson Progress**: pedagogical content and each player's completion state.
- **Submission**: one attempt with language, code, status, measured CPU time, passed tests,
  score, and author (player or team).
- **Best Score**: the retained result per player or team and challenge.
- **Leaderboard Entry**: a ranked score per scope (global, theme, season, event) with its
  tie-break timestamp.
- **Team / Team Member**: a group with name, tag, logo, captain, and membership roles.
- **Event / Event Participant**: a time-boxed competition and its registrations, with
  lifecycle status and attempt consumption.
- **Boss / Boss Phase / Player Health**: multi-phase encounters, their damage rules, and
  health, knockout, and regeneration state per player or team.
- **Wallet / Transaction**: a currency balance derived from an immutable, idempotent
  ledger.
- **Shop Item / Inventory**: purchasable hints, potions, and cosmetics, and what each
  player owns and equips.
- **Lore Chapter / Lore Progress**: narrative content and each player's read/unlock state.
- **Chat Channel / Message / Report / Sanction**: conversation spaces, their content, user
  reports, and moderation actions.
- **Battle Round / Round Result**: synchronized rounds and per-participant outcomes,
  including eliminations.
- **Audit Entry**: an immutable record of an administrative action or role change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user completes registration, e-mail confirmation, and first login in
  under 2 minutes, with at least 95% success on first attempt.
- **SC-002**: 95% of submissions return a verdict to the player in under 10 seconds.
- **SC-003**: Non-submission requests respond in under 300 ms at the 95th percentile.
- **SC-004**: The platform supports 1,000 simultaneously active users and a peak of 100
  submissions per minute without degradation, and capacity scales by adding execution
  workers.
- **SC-005**: 500 simultaneous real-time connections are served without message loss on
  critical journeys.
- **SC-006**: The same correct solution, executed twice on the same infrastructure,
  produces scores within ±5%.
- **SC-007**: 100% of hidden tests and reference solutions are absent from any client
  payload, verified by automated inspection.
- **SC-008**: Zero successful sandbox escapes across a documented penetration campaign
  covering network access, file reads, fork bombs, and memory exhaustion.
- **SC-009**: A retained submission updates the player's leaderboard position within 5
  seconds, and periodic rebuilds produce identical rankings.
- **SC-010**: Players complete a challenge with a correct solution on first attempt in at
  least 80% of cases after having completed the associated lesson.
- **SC-011**: 100% of critical journeys (registration → confirmation → lesson → challenge →
  leaderboard, password reset, account deletion, team creation and collaborative editing,
  single-attempt event) pass end-to-end on every release.
- **SC-012**: Business-logic coverage (scoring, economy, elimination, prerequisites) is at
  least 80%.
- **SC-013**: The platform is available 99.5% of the time over a rolling 30-day period.
- **SC-014**: A full database restore completes within 4 hours and passes an integrity check
  on scores, balances, and account states.
- **SC-015**: Critical journeys show zero critical accessibility violations and are fully
  operable by keyboard alone.
- **SC-016**: Critical journeys pass on the two latest versions of the four major browsers
  and on mobile, tablet, and desktop viewports.
- **SC-017**: Account erasure removes personal data within 30 days while anonymized scores
  remain available in leaderboards.
- **SC-018**: Battle royale round transitions are visible to all participants within 2
  seconds of the server-side deadline.
- **SC-019**: 95% of chat messages are delivered to connected recipients in under 1 second.
- **SC-020**: No voice recording exists anywhere in the platform, verified by configuration
  review and automated asset inspection.
- **SC-021**: Every currency balance equals the sum of its ledger entries at all times,
  verified continuously and by audit.
- **SC-022**: 100% of administrative actions and role changes are traceable in the audit log.

## Assumptions

- **Public cible** : étudiants en informatique (contexte BUT3), avec extension ultérieure
  possible ; le ton, la modération et le RGPD sont calibrés pour des utilisateurs majeurs.
- **Langages v1** : Python et JavaScript/Node.js, l'ajout de Java et C++ étant postérieur à
  la v1.
- **Points de vie** : consommés uniquement sur les boss et sur les événements explicitement
  marqués « hardcore » ; les défis standard restent à essais illimités et sans coût.
- **Battle royale** : jouable en solo et en équipe, avec un minimum de 8 participants.
- **Chat vocal** : inclus en v1 dans la phase tardive, sans enregistrement ; aucune
  intégration externe n'est retenue.
- **Hébergement** : serveur unique conteneurisé au lancement, avec une évolution vers une
  orchestration distribuée si la charge l'exige ; les runners sont isolés des données.
- **Périmètre exclu v1** : paiements en argent réel, application mobile native, plus de trois
  langages de programmation, tournois en présentiel, chat vocal multi-salons avec
  enregistrement.
- **Comptes** : un utilisateur possède une seule adresse e-mail et un seul pseudo, tous deux
  uniques ; plusieurs rôles peuvent être cumulés.
- **Sécurité de l'exécution** : tout code soumis est considéré comme hostile ; aucune
  exécution hors du bac à sable n'est admise, y compris en développement.
- **Internationalisation** : l'interface est livrée en français avec des textes
  externalisés ; l'anglais n'est pas requis en v1.
- **Données de test** : les jeux de tests de référence et les solutions « golden » sont
  fournis avec chaque défi et rejoués à chaque release.
- **Dépendances externes** : un service d'e-mail transactionnel et un stockage d'objets sont
  disponibles dans tous les environnements ; leur indisponibilité dégrade le service sans
  bloquer les parcours déjà engagés.
