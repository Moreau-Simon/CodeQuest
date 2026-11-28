import type { LessonSeed, QuizQuestionSeed, QuizSeed } from '../types';

type QuestionTuple = readonly [
  prompt: string,
  choices: readonly [string, string, string],
  answerIndex: number
];

function quiz(...tuples: readonly QuestionTuple[]): QuizSeed {
  const questions: QuizQuestionSeed[] = tuples.map(([prompt, choices, answerIndex], index) => ({
    id: `q${index + 1}`,
    prompt,
    choices: [...choices],
    answerIndex
  }));
  return { passScore: 70, questions };
}

interface LessonInput {
  slug: string;
  themeSlug: string;
  title: string;
  order: number;
  estimatedMinutes: number;
  objective: string;
  points: readonly [string, string, string];
  example: string;
  quiz: QuizSeed;
}

function lesson(input: LessonInput): LessonSeed {
  return {
    slug: input.slug,
    themeSlug: input.themeSlug,
    title: input.title,
    order: input.order,
    estimatedMinutes: input.estimatedMinutes,
    status: 'published',
    quiz: input.quiz,
    contentMd: [
      `# ${input.title}`,
      '',
      '## Objectif',
      '',
      input.objective,
      '',
      '## Points clés',
      '',
      ...input.points.map((point) => `- ${point}`),
      '',
      '## Exemple',
      '',
      '```text',
      input.example,
      '```',
      '',
      '## Mise en pratique',
      '',
      'Ouvrez le défi associé à cette leçon, puis appliquez la méthode décrite',
      'avant de consulter les indices. Le mini-quiz vérifie que vous avez',
      'compris les notions essentielles.'
    ].join('\n')
  };
}

/** Trente leçons publiées, trois par province, avec un mini-quiz pédagogique. */
export const LESSONS: LessonSeed[] = [
  lesson({
    slug: 'complexite-des-tris',
    themeSlug: 'algorithmes-de-tri',
    title: 'Choisir un algorithme de tri',
    order: 3,
    estimatedMinutes: 12,
    objective: 'Comparer les tris simples et les tris efficaces selon la taille des données.',
    points: [
      'Le tri par insertion est simple mais devient coûteux quand la liste grandit.',
      'Le tri fusion et le tri rapide restent proches de O(n log n) en moyenne.',
      'Un tri intégré est souvent le meilleur choix en production.'
    ],
    example: '10 éléments : insertion. 1 000 000 d’éléments : tri fusion ou tri intégré.',
    quiz: quiz(
      ['Quelle complexité moyenne caractérise le tri fusion ?', ['O(n)', 'O(n log n)', 'O(n²)'], 1],
      [
        'Quand le tri par insertion reste-t-il raisonnable ?',
        ['Sur de petites listes', 'Jamais', 'Sur des listes triées à l’envers'],
        0
      ],
      [
        'Un tri intégré doit-il être réécrit pour un défi ?',
        ['Toujours', 'Jamais', 'Seulement si la contrainte l’impose'],
        2
      ]
    )
  }),
  lesson({
    slug: 'tri-fusion',
    themeSlug: 'algorithmes-de-tri',
    title: 'Le tri fusion pas à pas',
    order: 4,
    estimatedMinutes: 18,
    objective: 'Décrire la division récursive puis la fusion de deux moitiés ordonnées.',
    points: [
      'On coupe la liste jusqu’à obtenir des sous-listes d’un élément.',
      'La fusion compare les têtes des deux listes et avance la plus petite.',
      'La profondeur de récursion est logarithmique.'
    ],
    example: '[4, 1, 3, 2] → [4, 1] + [3, 2] → [1, 4] + [2, 3] → [1, 2, 3, 4]',
    quiz: quiz(
      [
        'Que fait la phase de fusion ?',
        ['Elle coupe la liste', 'Elle intercale deux listes triées', 'Elle supprime les doublons'],
        1
      ],
      ['Quelle est la profondeur de récursion pour 16 éléments ?', ['2', '4', '16'], 1],
      ['Le tri fusion est-il stable ?', ['Oui', 'Non', 'Uniquement sur les tableaux'], 0]
    )
  }),
  lesson({
    slug: 'tris-lineaires',
    themeSlug: 'algorithmes-de-tri',
    title: 'Les tris à complexité linéaire',
    order: 5,
    estimatedMinutes: 15,
    objective: 'Comprendre comment le tri par comptage exploite un domaine de valeurs borné.',
    points: [
      'Le tri par comptage construit un histogramme des valeurs.',
      'Il est efficace seulement quand l’étendue des valeurs reste petite.',
      'La mémoire utilisée croît avec l’étendue, pas avec le nombre d’éléments.'
    ],
    example: 'Valeurs 0 à 9 : dix compartiments suffisent, quel que soit le nombre d’éléments.',
    quiz: quiz(
      [
        'Quand le tri par comptage est-il pertinent ?',
        ['Domaine de valeurs borné', 'Chaînes quelconques', 'Données non triables'],
        0
      ],
      [
        'Que contient le tableau de comptage ?',
        ['Les valeurs triées', 'Le nombre d’occurrences', 'Les index finaux'],
        1
      ],
      [
        'Quel est le défaut principal du comptage ?',
        [
          'Il est instable',
          'Il consomme de la mémoire selon l’étendue',
          'Il ne trie pas les nombres'
        ],
        1
      ]
    )
  }),
  lesson({
    slug: 'tableaux-et-listes',
    themeSlug: 'structures-de-donnees',
    title: 'Tableaux et listes chaînées',
    order: 1,
    estimatedMinutes: 14,
    objective: 'Distinguer accès direct et parcours séquentiel selon la structure choisie.',
    points: [
      'Un tableau offre un accès indexé en temps constant.',
      'Une liste chaînée insère rapidement mais impose un parcours pour accéder à un index.',
      'Le choix dépend des opérations les plus fréquentes.'
    ],
    example: 'Recherche par index : tableau. Insertions multiples en tête : liste chaînée.',
    quiz: quiz(
      [
        'Quel est le coût d’un accès par index dans un tableau ?',
        ['Constant', 'Linéaire', 'Logarithmique'],
        0
      ],
      [
        'Quel est le coût d’un accès par index dans une liste chaînée ?',
        ['Constant', 'Linéaire', 'Constant amorti'],
        1
      ],
      [
        'Quelle structure privilégier pour des insertions fréquentes en tête ?',
        ['Le tableau', 'La liste chaînée', 'Les deux sont égaux'],
        1
      ]
    )
  }),
  lesson({
    slug: 'piles-et-files',
    themeSlug: 'structures-de-donnees',
    title: 'Piles et files',
    order: 2,
    estimatedMinutes: 12,
    objective: 'Identifier les politiques LIFO et FIFO et leurs cas d’usage typiques.',
    points: [
      'Une pile retire le dernier élément ajouté.',
      'Une file retire le plus ancien élément en attente.',
      'Les files de messages servent à découpler producteurs et consommateurs.'
    ],
    example: 'Pile : annuler une action. File : traiter les soumissions dans l’ordre d’arrivée.',
    quiz: quiz(
      ['Quelle politique suit une pile ?', ['FIFO', 'LIFO', 'Priorité'], 1],
      ['Quelle politique suit une file ?', ['FIFO', 'LIFO', 'Dernier arrivé premier sorti'], 0],
      [
        'Quel usage typique d’une file de messages ?',
        ['Annuler une action', 'Découpler producteur et consommateur', 'Trier un tableau'],
        1
      ]
    )
  }),
  lesson({
    slug: 'arbres-binaires',
    themeSlug: 'structures-de-donnees',
    title: 'Arbres binaires de recherche',
    order: 3,
    estimatedMinutes: 20,
    objective: 'Expliquer comment un arbre équilibré accélère la recherche.',
    points: [
      'À chaque nœud, la valeur cherchée est comparée à la racine.',
      'Un arbre équilibré divise l’espace de recherche par deux à chaque niveau.',
      'Un arbre dégénéré se comporte comme une liste chaînée.'
    ],
    example: 'Rechercher 9 dans [2, 5, 8, 9, 12] : comparer à 8 puis à 9.',
    quiz: quiz(
      [
        'Que garantit un arbre de recherche ?',
        ['Les valeurs triées à gauche', 'Toutes les feuilles à droite', 'Une hauteur nulle'],
        0
      ],
      ['Quelle est la hauteur d’un arbre équilibré de 8 nœuds ?', ['1', '3', '8'], 1],
      [
        'Que se passe-t-il si l’arbre est dégénéré ?',
        ['La recherche devient linéaire', 'La recherche devient constante', 'La recherche échoue'],
        0
      ]
    )
  }),
  lesson({
    slug: 'notation-o',
    themeSlug: 'complexite-et-performance',
    title: 'Lire une notation O',
    order: 1,
    estimatedMinutes: 10,
    objective: 'Interpréter une borne de complexité sans confondre temps et mémoire.',
    points: [
      'La notation O décrit une croissance, pas un temps en millisecondes.',
      'On conserve le terme dominant et on ignore les constantes.',
      'Le pire cas et le cas moyen doivent être précisés.'
    ],
    example: '3n² + 10n + 7 devient O(n²).',
    quiz: quiz(
      ['Que décrit O(n) ?', ['Un temps exact', 'Une croissance linéaire', 'Une limite mémoire'], 1],
      ['Quelle est la forme simplifiée de 5n + 100 ?', ['O(5n)', 'O(n)', 'O(100)'], 1],
      ['Faut-il préciser le cas étudié ?', ['Non', 'Oui', 'Seulement pour la mémoire'], 1]
    )
  }),
  lesson({
    slug: 'analyse-d-une-boucle',
    themeSlug: 'complexite-et-performance',
    title: 'Analyser une boucle imbriquée',
    order: 2,
    estimatedMinutes: 16,
    objective: 'Relier le nombre d’itérations imbriquées à la complexité du traitement.',
    points: [
      'Une boucle simple sur n éléments coûte O(n).',
      'Deux boucles imbriquées indépendantes coûtent O(n²).',
      'Une boucle dont le pas double à chaque tour coûte O(log n).'
    ],
    example: 'for i in range(n): for j in range(n): ... → n² opérations.',
    quiz: quiz(
      ['Quelle complexité pour deux boucles imbriquées sur n ?', ['O(n)', 'O(log n)', 'O(n²)'], 2],
      ['Quelle complexité quand le pas double ?', ['O(n)', 'O(log n)', 'O(n²)'], 1],
      [
        'Que compte-t-on pour analyser une boucle ?',
        ['Les lignes de code', 'Le nombre d’itérations', 'Les caractères'],
        1
      ]
    )
  }),
  lesson({
    slug: 'mesurer-le-temps-cpu',
    themeSlug: 'complexite-et-performance',
    title: 'Mesurer le temps CPU médian',
    order: 3,
    estimatedMinutes: 14,
    objective: 'Comprendre pourquoi la médiane de plusieurs exécutions est plus fiable.',
    points: [
      'Une seule mesure peut être perturbée par le système.',
      'Cinq exécutions consécutives et la médiane lissent les variations.',
      'Le bonus de performance dépend de la médiane, pas du meilleur temps.'
    ],
    example: 'Mesures 12, 11, 30, 12, 13 ms → médiane 12 ms.',
    quiz: quiz(
      [
        'Pourquoi répéter une mesure ?',
        ['Pour augmenter le score', 'Pour réduire le bruit', 'Pour changer l’algorithme'],
        1
      ],
      ['Quelle statistique est utilisée ?', ['La moyenne', 'Le maximum', 'La médiane'], 2],
      ['Un pic isolé influence-t-il la médiane ?', ['Fortement', 'Faiblement', 'Toujours'], 1]
    )
  }),
  lesson({
    slug: 'lire-une-pile-d-appel',
    themeSlug: 'debugging',
    title: 'Lire une pile d’appels',
    order: 1,
    estimatedMinutes: 12,
    objective: 'Retrouver l’origine d’une erreur à partir de la trace d’exécution.',
    points: [
      'La trace se lit du haut de la pile vers le point de défaillance.',
      'La dernière frame correspond souvent au symptôme, pas à la cause.',
      'Les appels intermédiaires racontent le chemin des données.'
    ],
    example: 'solve → normalize → split → IndexError dans split.',
    quiz: quiz(
      [
        'Que montre une pile d’appels ?',
        ['La chronologie des appels', 'Le code source complet', 'Les tests cachés'],
        0
      ],
      ['La dernière frame est-elle toujours la cause ?', ['Oui', 'Non', 'Uniquement en Python'], 1],
      [
        'Que faire après avoir lu la trace ?',
        ['Isoler le cas', 'Supprimer les tests', 'Changer de langage'],
        0
      ]
    )
  }),
  lesson({
    slug: 'isolateur-un-cas',
    themeSlug: 'debugging',
    title: 'Isoler un cas minimal',
    order: 2,
    estimatedMinutes: 15,
    objective: 'Réduire une entrée défaillante au plus petit exemple reproductible.',
    points: [
      'Supprimez progressivement les éléments sans faire disparaître le bug.',
      'Un cas minimal rend la cause visible et le correctif vérifiable.',
      'Gardez le cas original pour valider la correction finale.'
    ],
    example: 'Une liste de 30 valeurs réduite à [2, 0, 2] qui reproduit l’erreur.',
    quiz: quiz(
      [
        'Que faut-il conserver pendant la réduction ?',
        ['Le bug reproductible', 'Tous les commentaires', 'La mise en forme'],
        0
      ],
      [
        'Pourquoi réduire l’entrée ?',
        ['Pour cacher l’erreur', 'Pour isoler la cause', 'Pour gagner du temps CPU'],
        1
      ],
      [
        'Le cas réduit remplace-t-il le cas initial ?',
        ['Oui toujours', 'Non, on garde les deux', 'Uniquement si le bug change'],
        1
      ]
    )
  }),
  lesson({
    slug: 'lignes-modifiees',
    themeSlug: 'debugging',
    title: 'Limiter les lignes modifiées',
    order: 3,
    estimatedMinutes: 11,
    objective: 'Corriger un défaut sans réécrire inutilement le code fourni.',
    points: [
      'Une modification ciblée préserve le comportement déjà correct.',
      'La limite de lignes modifiées protège le bonus de performance.',
      'Relisez le diff avant de soumettre.'
    ],
    example: 'Une condition inversée se corrige en une ligne, pas en réécrivant la fonction.',
    quiz: quiz(
      [
        'Que mesure la limite de lignes modifiées ?',
        ['La taille du fichier', 'L’écart avec le code bogué', 'Le temps CPU'],
        1
      ],
      [
        'Pourquoi éviter une réécriture complète ?',
        [
          'Elle est interdite par le runner',
          'Elle peut casser un comportement correct',
          'Elle réduit le nombre de tests'
        ],
        1
      ],
      [
        'Quand soumettre après correction ?',
        ['Avant relecture', 'Après relecture du diff', 'Sans tester'],
        1
      ]
    )
  }),
  lesson({
    slug: 'chiffrement-cesar',
    themeSlug: 'cryptographie',
    title: 'Le chiffrement par décalage',
    order: 1,
    estimatedMinutes: 13,
    objective: 'Décrire un chiffrement monoalphabétique et ses limites.',
    points: [
      'Chaque lettre est remplacée par une lettre située un nombre fixe plus loin.',
      'La fréquence des lettres trahit le décalage.',
      'La clé ne doit pas être stockée dans le message.'
    ],
    example: 'décalage de 3 : abcxyz → defabc.',
    quiz: quiz(
      [
        'Qu’est-ce qu’un décalage de César ?',
        ['Un permutateur de lettres', 'Un hash', 'Une signature'],
        0
      ],
      [
        'Comment retrouver le décalage ?',
        ['Par la fréquence des lettres', 'En devinant au hasard', 'En mesurant le CPU'],
        0
      ],
      ['Où placer la clé ?', ['Dans le message', 'Dans un canal séparé', 'Dans le titre'], 1]
    )
  }),
  lesson({
    slug: 'xor-et-masques',
    themeSlug: 'cryptographie',
    title: 'XOR et masques répétés',
    order: 2,
    estimatedMinutes: 16,
    objective: 'Comprendre le chiffrement XOR et le danger d’une clé trop courte.',
    points: [
      'XOR est réversible : appliquer deux fois la même clé redonne le clair.',
      'Une clé répétée laisse des motifs détectables.',
      'La longueur de la répétition peut être estimée par autocorrelation.'
    ],
    example: 'clair ⊕ clé = chiffré ; chiffré ⊕ clé = clair.',
    quiz: quiz(
      ['Que vaut (a XOR b) XOR b ?', ['a', 'b', '0'], 0],
      [
        'Quel défaut d’une clé courte ?',
        ['Elle est trop lente', 'Elle crée des motifs', 'Elle est impossible à calculer'],
        1
      ],
      [
        'Que mesure l’autocorrelation ?',
        ['La répétition d’un motif', 'La taille du fichier', 'La vitesse CPU'],
        0
      ]
    )
  }),
  lesson({
    slug: 'fonctions-de-hachage',
    themeSlug: 'cryptographie',
    title: 'Empreintes et vérification',
    order: 3,
    estimatedMinutes: 14,
    objective: 'Utiliser une empreinte pour détecter une altération sans révéler le contenu.',
    points: [
      'Une empreinte est de taille fixe et sensible au moindre changement.',
      'Deux empreintes différentes garantissent deux contenus différents.',
      'Une collision reste possible théoriquement.'
    ],
    example: 'SHA-256 du fichier transmis comparé à l’empreinte annoncée.',
    quiz: quiz(
      [
        'Que garantit une empreinte ?',
        ['La confidentialité', 'La détection d’altération', 'La vitesse'],
        1
      ],
      [
        'Que se passe-t-il si un octet change ?',
        ['L’empreinte change', 'Rien', 'Le fichier grandit'],
        0
      ],
      ['Une empreinte est-elle secrète ?', ['Oui', 'Non', 'Uniquement en mémoire'], 1]
    )
  }),
  lesson({
    slug: 'bits-de-poids-faible',
    themeSlug: 'steganographie',
    title: 'Les bits de poids faible',
    order: 1,
    estimatedMinutes: 16,
    objective: 'Expliquer comment dissimuler un message dans les bits les moins significatifs.',
    points: [
      'Modifier le dernier bit d’une couleur change à peine l’image.',
      'Les bits de poids faible forment un canal discret.',
      'Une modification trop fréquente devient statistiquement visible.'
    ],
    example: 'Remplacer 10110100 par 10110101 ne change la valeur que d’un.',
    quiz: quiz(
      [
        'Quel bit modifie-t-on en priorité ?',
        ['Le plus significatif', 'Le moins significatif', 'Le bit de signe'],
        1
      ],
      [
        'Que devient le canal si l’on modifie trop de pixels ?',
        ['Il devient invisible', 'Il devient détectable', 'Il disparaît'],
        1
      ],
      [
        'Quelle propriété est préservée ?',
        ['L’apparence générale', 'La taille du fichier uniquement', 'Le nom du fichier'],
        0
      ]
    )
  }),
  lesson({
    slug: 'canaux-de-couleur',
    themeSlug: 'steganographie',
    title: 'Choisir un canal de couleur',
    order: 2,
    estimatedMinutes: 13,
    objective: 'Comparer les canaux R, V, B selon leur sensibilité visuelle.',
    points: [
      'Le canal bleu est souvent moins perceptible à l’œil humain.',
      'Répartir les bits sur plusieurs canaux augmente la capacité.',
      'Le format PNG préserve les données sans perte, contrairement au JPEG.'
    ],
    example: 'Un pixel RVB porte trois bits, un par composante.',
    quiz: quiz(
      ['Quel format préserve les bits modifiés ?', ['JPEG', 'PNG', 'GIF animé'], 1],
      ['Quel canal est souvent le moins visible ?', ['Rouge', 'Vert', 'Bleu'], 2],
      [
        'Que gagne-t-on à utiliser trois canaux ?',
        ['De la capacité', 'De la visibilité', 'Rien'],
        0
      ]
    )
  }),
  lesson({
    slug: 'detection-statistique',
    themeSlug: 'steganographie',
    title: 'Détecter une image modifiée',
    order: 3,
    estimatedMinutes: 17,
    objective: 'Repérer une dissimulation par l’analyse de la distribution des bits.',
    points: [
      'Une image naturelle présente une répartition irrégulière des bits faibles.',
      'Un canal saturé de 0 et de 1 uniformes est suspect.',
      'La comparaison avec l’image originale reste la preuve la plus fiable.'
    ],
    example: 'Histogramme des derniers bits : pic à 0 et à 1 au lieu d’une répartition douce.',
    quiz: quiz(
      [
        'Qu’est-ce qui trahit une dissimulation ?',
        ['Une répartition uniforme des bits faibles', 'Une image plus grande', 'Un nom suspect'],
        0
      ],
      [
        'Quelle preuve est la plus forte ?',
        ['Une intuition', 'La comparaison avec l’original', 'La couleur dominante'],
        1
      ],
      ['Toute image uniforme est-elle trafiquée ?', ['Oui', 'Non', 'Uniquement si elle est PNG'], 1]
    )
  }),
  lesson({
    slug: 'symboles-qr',
    themeSlug: 'automates-et-qr',
    title: 'Anatomie d’un code QR',
    order: 1,
    estimatedMinutes: 14,
    objective: 'Repérer les modules de position, de synchronisation et de données.',
    points: [
      'Trois carrés de repérage définissent l’orientation du symbole.',
      'Une ligne de synchronisation alterne noir et blanc.',
      'Le masque améliore la lisibilité optique.'
    ],
    example: 'Un QR de version 1 contient une grille de 21 × 21 modules.',
    quiz: quiz(
      ['Combien de repères de position ?', ['Un', 'Trois', 'Quatre'], 1],
      [
        'À quoi sert le masque ?',
        ['À chiffrer', 'À améliorer la lecture', 'À réduire la taille'],
        1
      ],
      ['Que contient une version 1 ?', ['21 × 21 modules', '10 × 10 modules', '57 × 57 modules'], 0]
    )
  }),
  lesson({
    slug: 'niveaux-de-correction',
    themeSlug: 'automates-et-qr',
    title: 'Niveaux de correction d’erreur',
    order: 2,
    estimatedMinutes: 15,
    objective: 'Choisir un niveau de redondance adapté à l’environnement de lecture.',
    points: [
      'Les niveaux vont de L à H selon la part de symboles récupérables.',
      'Plus la correction est forte, moins la capacité de données est grande.',
      'Un QR imprimé sur petit support gagne à utiliser un niveau élevé.'
    ],
    example: 'Niveau H : environ 30 % de la surface peut être endommagée.',
    quiz: quiz(
      ['Quel niveau corrige le plus ?', ['L', 'M', 'H'], 2],
      [
        'Quel est le compromis d’un niveau élevé ?',
        ['Moins de données', 'Plus de vitesse', 'Plus de couleurs'],
        0
      ],
      ['Quand choisir H ?', ['Sur un petit support abîmé', 'Jamais', 'Uniquement à l’écran'], 0]
    )
  }),
  lesson({
    slug: 'integrite-des-donnees',
    themeSlug: 'automates-et-qr',
    title: 'Vérifier l’intégrité d’un message',
    order: 3,
    estimatedMinutes: 12,
    objective: 'Distinguer détection d’erreur et correction d’erreur.',
    points: [
      'Détecter signale une altération sans la réparer.',
      'Corriger reconstruit le message original dans certaines limites.',
      'Un contrôle final évite d’accepter une lecture douteuse.'
    ],
    example: 'Une somme de contrôle détecte ; un code de Reed-Solomon corrige.',
    quiz: quiz(
      ['Que fait une somme de contrôle ?', ['Elle détecte', 'Elle corrige', 'Elle compresse'], 0],
      ['Que fait Reed-Solomon ?', ['Elle détecte uniquement', 'Elle corrige', 'Elle chiffre'], 1],
      [
        'Quand refuser une lecture ?',
        ['Après vérification finale échouée', 'Toujours', 'Jamais'],
        0
      ]
    )
  }),
  lesson({
    slug: 'fonctions-pures',
    themeSlug: 'programmation-functionnelle',
    title: 'Fonctions pures et effets de bord',
    order: 1,
    estimatedMinutes: 12,
    objective: 'Identifier une fonction dont le résultat dépend uniquement de ses arguments.',
    points: [
      'Une fonction pure ne modifie aucun état extérieur.',
      'À entrée égale, la sortie est toujours identique.',
      'Les effets de bord sont regroupés en périphérie du programme.'
    ],
    example: 'somme(values) est pure ; logger(values) ne l’est pas.',
    quiz: quiz(
      [
        'Qu’est-ce qu’une fonction pure ?',
        ['Sans effet de bord', 'Sans paramètre', 'Sans retour'],
        0
      ],
      [
        'Que vaut f(x) appelée deux fois ?',
        ['Deux résultats possibles', 'Le même résultat', 'Une erreur'],
        1
      ],
      ['Où placer les effets de bord ?', ['Partout', 'En périphérie', 'Dans les boucles'], 1]
    )
  }),
  lesson({
    slug: 'reduction-et-cartographie',
    themeSlug: 'programmation-functionnelle',
    title: 'Cartographier et réduire',
    order: 2,
    estimatedMinutes: 15,
    objective: 'Transformer une collection puis en extraire une valeur unique.',
    points: [
      'map applique une fonction à chaque élément.',
      'filter conserve seulement les éléments qui satisfont un prédicat.',
      'reduce combine les éléments en un résultat unique.'
    ],
    example: 'sum(map(carre, filter(est_pair, valeurs)))',
    quiz: quiz(
      ['Que fait map ?', ['Il filtre', 'Il transforme chaque élément', 'Il trie'], 1],
      ['Que fait filter ?', ['Il conserve selon un prédicat', 'Il compte', 'Il inverse'], 0],
      ['Que fait reduce ?', ['Il combine en une valeur', 'Il répète', 'Il vérifie'], 0]
    )
  }),
  lesson({
    slug: 'immutabilite',
    themeSlug: 'programmation-functionnelle',
    title: 'Immutabilité des données',
    order: 3,
    estimatedMinutes: 13,
    objective: 'Éviter les modifications surprises en construisant de nouvelles valeurs.',
    points: [
      'Une structure immuable ne change jamais après création.',
      'Les copies évitent que deux chemins partagent un état modifiable.',
      'Les tuples Python et les tableaux gelés JavaScript en sont des exemples.'
    ],
    example: 'nouvelles = [*anciennes, valeur] plutôt que anciennes.append(valeur).',
    quiz: quiz(
      [
        'Qu’est-ce qu’une donnée immuable ?',
        ['Qui ne change pas', 'Qui est secrète', 'Qui est rapide'],
        0
      ],
      [
        'Pourquoi copier avant d’ajouter ?',
        ['Pour éviter de modifier l’original', 'Pour gagner du CPU', 'Pour changer le type'],
        0
      ],
      ['Un tuple Python est-il immuable ?', ['Oui', 'Non', 'Seulement vide'], 0]
    )
  }),
  lesson({
    slug: 'modelisation-relationnelle',
    themeSlug: 'bases-de-donnees',
    title: 'Modéliser en tables',
    order: 1,
    estimatedMinutes: 18,
    objective: 'Traduire des entités métier en tables avec clés et relations.',
    points: [
      'Une clé primaire identifie chaque ligne de façon unique.',
      'Une clé étrangère garantit l’existence de la cible.',
      'Les contraintes SQL protègent les invariants même hors de l’application.'
    ],
    example: 'challenge → theme : challenge.theme_id référence theme.id.',
    quiz: quiz(
      ['Que garantit une clé primaire ?', ['L’unicité', 'Le tri', 'La confidentialité'], 0],
      [
        'Que garantit une clé étrangère ?',
        ['L’existence de la cible', 'La vitesse', 'Le chiffrement'],
        0
      ],
      [
        'Où placer un invariant critique ?',
        ['Uniquement dans le front', 'Dans la base aussi', 'Dans un commentaire'],
        1
      ]
    )
  }),
  lesson({
    slug: 'index-et-requetes',
    themeSlug: 'bases-de-donnees',
    title: 'Indexer pour interroger',
    order: 2,
    estimatedMinutes: 16,
    objective: 'Comprendre comment un index accélère un filtre tout en coûtant de l’espace.',
    points: [
      'Un index composite suit l’ordre des colonnes déclarées.',
      'Un filtre qui ne respecte pas le préfixe ne profite pas de l’index.',
      'Chaque index ralentit légèrement les écritures.'
    ],
    example: 'Index (status, difficulty, title) sert un filtre status + difficulty.',
    quiz: quiz(
      [
        'Que suit un index composite ?',
        ['L’ordre des colonnes', 'L’ordre alphabétique inverse', 'Le hasard'],
        0
      ],
      [
        'Un index sans son préfixe est-il utilisé ?',
        ['Oui toujours', 'Non', 'Uniquement en écriture'],
        1
      ],
      ['Quel est le coût d’un index ?', ['Espace et écritures', 'Aucun', 'Lecture seule'], 0]
    )
  }),
  lesson({
    slug: 'transactions-atomiques',
    themeSlug: 'bases-de-donnees',
    title: 'Transactions atomiques',
    order: 3,
    estimatedMinutes: 17,
    objective: 'Garantir qu’un groupe d’écritures réussit entièrement ou pas du tout.',
    points: [
      'Une transaction est atomique, cohérente, isolée et durable.',
      'Les deux écritures d’un classement et du ledger doivent être atomiques.',
      'Une clé d’idempotence évite les doubles crédits en cas de rejeu.'
    ],
    example: 'score + classement + ledger validés dans la même transaction.',
    quiz: quiz(
      ['Que signifie atomique ?', ['Tout ou rien', 'Très rapide', 'Chiffré'], 0],
      [
        'Pourquoi une clé d’idempotence ?',
        ['Pour éviter les doublons', 'Pour accélérer', 'Pour trier'],
        0
      ],
      [
        'Que faire si une écriture échoue ?',
        ['Valider les autres', 'Annuler la transaction', 'Recommencer indéfiniment'],
        1
      ]
    )
  }),
  lesson({
    slug: 'threads-et-processus',
    themeSlug: 'concurrence',
    title: 'Threads et processus',
    order: 1,
    estimatedMinutes: 15,
    objective: 'Distinguer mémoire partagée et mémoire isolée selon le modèle de concurrence.',
    points: [
      'Les threads partagent le même espace mémoire.',
      'Les processus isolent leur mémoire et communiquent explicitement.',
      'Le runner exécute le code utilisateur dans un processus isolé.'
    ],
    example: 'Un thread par requête côté API ; un processus par soumission côté runner.',
    quiz: quiz(
      ['Que partagent deux threads ?', ['Leur mémoire', 'Leur disque uniquement', 'Rien'], 0],
      [
        'Comment communiquent deux processus ?',
        ['Par messages explicites', 'Par variables globales', 'Impossible'],
        0
      ],
      ['Quel modèle isole le mieux ?', ['Le thread', 'Le processus', 'Les deux sont identiques'], 1]
    )
  }),
  lesson({
    slug: 'sections-critiques',
    themeSlug: 'concurrence',
    title: 'Protéger une section critique',
    order: 2,
    estimatedMinutes: 16,
    objective: 'Éviter qu’accès concurrent et mise à jour produisent une valeur perdue.',
    points: [
      'Une section critique accède à une ressource partagée.',
      'Un verrou serialize les accès mais peut créer des attentes.',
      'Une mise à jour conditionnelle en base évite souvent le verrou applicatif.'
    ],
    example: 'UPDATE ... WHERE status = pending garantit une seule transition.',
    quiz: quiz(
      [
        'Qu’est-ce qu’une section critique ?',
        ['Un accès à une ressource partagée', 'Un bloc de commentaires', 'Une fonction pure'],
        0
      ],
      [
        'Que risque-t-on sans protection ?',
        ['Une perte de mise à jour', 'Une erreur de syntaxe', 'Rien'],
        0
      ],
      [
        'Quelle alternative à un verrou ?',
        ['Une mise à jour conditionnelle', 'Plus de threads', 'Moins de tests'],
        0
      ]
    )
  }),
  lesson({
    slug: 'files-de-messages',
    themeSlug: 'concurrence',
    title: 'Files de messages et rejeu',
    order: 3,
    estimatedMinutes: 14,
    objective: 'Concevoir un traitement tolérant aux livraisons multiples.',
    points: [
      'Une file découplage producteur et consommateur.',
      'Un message peut être livré deux fois : le traitement doit être idempotent.',
      'Une clé stable permet de reconnaître un rejeu et de l’ignorer.'
    ],
    example: 'jobId = submissionId : un même essai ne produit qu’un seul verdict.',
    quiz: quiz(
      [
        'Que peut-il arriver à un message ?',
        ['Une livraison unique garantie', 'Un rejeu possible', 'Une suppression automatique'],
        1
      ],
      [
        'Comment gérer le rejeu ?',
        ['Par idempotence', 'En ignoring tous les messages', 'En dupliquant le travail'],
        0
      ],
      [
        'Que vaut jobId dans CodeQuest ?',
        ['Un nombre aléatoire', 'L’identifiant de soumission', 'Le nom du runner'],
        1
      ]
    )
  })
];
