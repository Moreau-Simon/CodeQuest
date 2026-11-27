# Manuel utilisateur — CodeQuest

**Date** : 28 novembre 2026 · Public : joueuses, joueurs et capitaines d'équipe.

## 1. Inscription et compte

1. Ouvrir `/register`, saisir un pseudonyme, une adresse e-mail et un mot de passe, puis
   accepter les consentements.
2. Confirmer l'adresse via le lien reçu par e-mail : le compte passe alors en statut `active`.
3. Se connecter sur `/login`. Les sessions sont listées dans `/settings/sessions` ; une session
   suspecte peut être révoquée immédiatement.
4. Le profil (`/settings/profile`) permet de changer le pseudonyme, l'avatar, la langue, le
   thème, les volumes sonores et « Réduire les animations ».
5. La suppression du compte se fait dans les paramètres avec réauthentification. Les scores
   conservés dans les classements sont alors anonymisés ; aucun pseudonyme n'est conservé.

## 2. Apprendre avec les cours et le lore

- Le parcours `/lessons` présente les cours dans l'ordre. Un cours se lit en mode libre ;
  le quiz valide la progression et débloque le défi associé.
- Un positionnement permet de dispenser un cours déjà maîtrisé.
- Le lore se débloque chapitre par chapitre. Les cours déjà consultés restent lisibles hors
  ligne : l'application les met en cache sur l'appareil. Les scores, transactions et échanges
  temps réel ne sont jamais mis en cache.
- L'interface est utilisable au clavier (lien d'évitement, focus visible) et annonce les
  changements de statut aux lecteurs d'écran.

## 3. Résoudre un défi

1. Depuis `/challenges`, filtrer les défis publiés. Un défi verrouillé affiche explicitement
   les prérequis manquants (niveau, défi, cours ou chapitre de lore).
2. Sur la page du défi, lire l'énoncé, choisir le langage et soumettre. Le verdict filtré
   n'expose jamais les tests cachés ni la solution de référence.
3. Le score combine la proportion de tests réussis et un bonus de performance ; pour les
   défis de débogage/décryptage, le chrono démarre au bouton « Démarrer » et les indices ou
   lignes modifiées au-delà de la limite réduisent le score.
4. Les indices ne sont disponibles qu'en solo, hors événement ouvert et hors rencontre de boss ;
   ils s'achètent dans l'ordre avec des Bits.
5. Chaque soumission est idempotente : un rejeu réseau ne crédite jamais deux fois la récompense.

## 4. Classements, équipes et événements

- `/leaderboards` affiche les classements par période et votre position ; un onglet présente
  le classement des équipes.
- Une équipe se crée depuis `/teams`. Le capitaine invite un joueur avec un lien contenant
  l'identifiant de l'équipe et un jeton ; le joueur rejoint via ce lien.
- La soumission **officielle** d'une équipe est désignée explicitement par le capitaine dans les
  paramètres de l'équipe ; le dernier choix remplace le précédent.
- Un événement à essai unique s'ouvre sans consommer d'essai : le chrono et l'essai ne sont
  engagés qu'au démarrage explicite. Un second essai est refusé, y compris après abandon.

## 5. Boutique, boss et notifications

- Les Bits s'obtiennent par récompense de défi, série de connexions et événements. La boutique
  vend des indices et des objets cosmétiques ; l'équipement d'un objet ne modifie jamais un score.
- Les boss se combattent à plusieurs : les points de vie sont partagés et les récompenses sont
  réparties entre les participants.
- Les notifications (web push et in-app) sont gérées dans le profil. Le fonctionnement hors ligne
  est signalé par une bannière ; la reconnexion reprend automatiquement.

En cas de problème, transmettre le pseudo, l'heure UTC, la page concernée et le message
d'erreur affiché — jamais votre mot de passe ni un jeton de session.
