import type { LoreChapterSeed } from '../types';

interface ChapterInput {
  slug: string;
  title: string;
  order: number;
  requiredLevel: number;
  arc: string;
  intro: string;
  scenes: readonly [string, string];
  revelation: string;
}

/** Compose un chapitre lisible en Markdown, sans dépendance au stockage. */
function chapter(input: ChapterInput): LoreChapterSeed {
  return {
    slug: input.slug,
    title: input.title,
    order: input.order,
    requiredLevel: input.requiredLevel,
    audioKey: `lore.${input.slug}`,
    contentMd: [
      `# ${input.title}`,
      '',
      `*${input.arc}*`,
      '',
      input.intro,
      '',
      '## La découverte',
      '',
      input.scenes[0],
      '',
      input.scenes[1],
      '',
      '## Ce que cela change',
      '',
      input.revelation,
      '',
      '> Chaque chapitre débloque une région et son lot de défis. Relisez-le avant',
      '> d’affronter le gardien qui veille sur cette partie de la Grille.'
    ].join('\n')
  };
}

/** Douze chapitres répartis en quatre arcs, du tutoriel au boss final. */
export const LORE_CHAPTERS: LoreChapterSeed[] = [
  chapter({
    slug: 'les-fondations',
    title: 'Les fondations de la Grille',
    order: 1,
    requiredLevel: 1,
    arc: 'Arc I — L’éveil',
    intro:
      'La Grille est un immense réseau de circuits où chaque décision se transforme en signal. ' +
      'Personne ne sait qui l’a construite, mais ses habitants apprennent très tôt à lire ses motifs.',
    scenes: [
      'Au réveil, le voyageur reçoit une suite de nombres désordonnés gravée dans une plaque de cuivre. ' +
        'L’inscription demande simplement de les remettre en ordre avant que la porte ne se referme.',
      'Un vieux cartographe explique que trier n’est pas ranger pour ranger : c’est rendre le monde ' +
        'prévisible. Sur la Grille, une liste ordonnée permet de prévoir la suite des événements.'
    ],
    revelation:
      'Le premier sort sort de l’ombre : l’ordre est une forme de pouvoir. Le voyageur comprend ' +
      'que chaque défi résolu rend la Grille un peu plus lisible.'
  }),
  chapter({
    slug: 'le-premier-signal',
    title: 'Le premier signal',
    order: 2,
    requiredLevel: 1,
    arc: 'Arc I — L’éveil',
    intro:
      'Les couloirs de la Grille résonnent d’un bruit régulier. Les habitants l’appellent le premier ' +
      'signal : une suite de valeurs qui revient toujours, quoi qu’on fasse.',
    scenes: [
      'Le voyageur suit le signal jusqu’à une salle circulaire. Au centre, des tableaux flottants ' +
        'enregistrent chaque passage et renvoient une somme identique.',
      'Une inscription précise que la valeur totale ne ment jamais, même quand les éléments ' +
        'individuels changent de place.'
    ],
    revelation:
      'Additionner devient un outil de vérification : si le total diffère, quelqu’un ou quelque chose ' +
      'a modifié la séquence en chemin.'
  }),
  chapter({
    slug: 'la-carte-des-regions',
    title: 'La carte des régions',
    order: 3,
    requiredLevel: 2,
    arc: 'Arc I — L’éveil',
    intro:
      'La carte de la Grille ne se dessine pas : elle se déduit. Chaque thème est une province ' +
      'dont les frontières sont faites de leçons et de défis.',
    scenes: [
      'Les cartographes mesurent les distances en nombre de transformations nécessaires pour ' +
        'passer d’un état à un autre. Une route courte est une route élégante.',
      'Le voyageur trace sa première route entre les tableaux et les suites, et découvre que ' +
        'deux chemins apparemment différents mènent au même résultat.'
    ],
    revelation:
      'Une province ne se débloque pas par la force : il faut d’abord comprendre comment ses ' +
      'éléments sont reliés.'
  }),
  chapter({
    slug: 'la-boucle-infinie',
    title: 'La boucle infinie',
    order: 4,
    requiredLevel: 3,
    arc: 'Arc II — La dérive',
    intro:
      'Au-delà de la troisième province, le temps se met à tourner en rond. Une boucle gigantesque ' +
      'rejoue sans fin la même instruction et use ceux qui tentent de la traverser.',
    scenes: [
      'Le voyageur trouve des traces de pas anciennes qui reviennent toujours au même point. ' +
        'Chaque passage laisse une valeur un peu différente.',
      'En comparant les traces, il apparaît qu’une condition n’est jamais satisfaite : la boucle ' +
        'attend une valeur qu’elle modifie elle-même.'
    ],
    revelation:
      'Observer n’est pas suffisant : il faut savoir quelle partie du système change à chaque tour ' +
      'et laquelle doit rester stable.'
  }),
  chapter({
    slug: 'le-jardin-des-erreurs',
    title: 'Le jardin des erreurs',
    order: 5,
    requiredLevel: 4,
    arc: 'Arc II — La dérive',
    intro:
      'Les erreurs ne sont pas punies sur la Grille. Elles sont cultivées dans un jardin où chaque ' +
      'bug devient une plante identifiable.',
    scenes: [
      'Le jardinier montre une tige tordue : elle correspond à une ligne modifiée par mégarde. ' +
        'Une autre plante pousse à l’envers, signe d’une condition inversée.',
      'Le voyageur apprend à remonter d’un symptôme à sa cause en isolant la plus petite portion ' +
        'de code qui reproduit le problème.'
    ],
    revelation:
      'Réparer demande de la précision plutôt que de la vitesse : modifier trop de lignes détruit ' +
      'l’équilibre du jardin.'
  }),
  chapter({
    slug: 'le-temps-perdu',
    title: 'Le temps perdu',
    order: 6,
    requiredLevel: 5,
    arc: 'Arc II — La dérive',
    intro:
      'Dans les salles de calcul, le temps est une ressource mesurable. Deux solutions exactes peuvent ' +
      'être séparées par un gouffre de quelques millisecondes.',
    scenes: [
      'Une horloge suspendue compare les mêmes opérations exécutées de deux façons. La première ' +
        'parcourt tout ; la seconde s’arrête dès qu’elle a trouvé.',
      'Le gardien du lieu refuse de laisser passer quiconque ne sait pas expliquer pourquoi une ' +
        'méthode coûte plus cher qu’une autre.'
    ],
    revelation:
      'La complexité n’est pas un détail : elle décide si une solution tient dans la fenêtre ' +
      'imposée par la Grille.'
  }),
  chapter({
    slug: 'les-archives-chiffrees',
    title: 'Les archives chiffrées',
    order: 7,
    requiredLevel: 6,
    arc: 'Arc III — Les archives',
    intro:
      'Les archives conservent l’histoire de la Grille sous une forme illisible. Seuls les motifs ' +
      'des chiffrements subsistent, comme des serrures sans serrurier.',
    scenes: [
      'Le voyageur découvre des messages où chaque lettre a été décalée d’un nombre fixe. ' +
        'Le décalage change d’une salle à l’autre.',
      'Une note marginale rappelle que la clé ne doit jamais être écrite à côté du message : ' +
        'elle circule dans un autre canal.'
    ],
    revelation:
      'Déchiffrer, c’est reconstruire la règle à partir des régularités observées, sans jamais ' +
      'deviner la graine secrète.'
  }),
  chapter({
    slug: 'la-cle-miroir',
    title: 'La clé miroir',
    order: 8,
    requiredLevel: 7,
    arc: 'Arc III — Les archives',
    intro:
      'Une clé miroir ne s’utilise pas seule : elle révèle la structure d’une autre clé. ' +
      'Les archives en conservent plusieurs, toutes incomplètes.',
    scenes: [
      'En superposant deux fragments, le voyageur voit apparaître une répétition. ' +
        'La répétition trahit la longueur de la grille utilisée.',
      'Le bibliothécaire prévient qu’un fragment falsifié peut conduire à une fausse certitude ' +
        'pendant très longtemps.'
    ],
    revelation:
      'La confiance vient de la cohérence entre plusieurs indices indépendants, jamais d’une ' +
      'seule révélation.'
  }),
  chapter({
    slug: 'le-message-cache',
    title: 'Le message caché',
    order: 9,
    requiredLevel: 8,
    arc: 'Arc III — Les archives',
    intro:
      'Certains messages ne sont pas chiffrés : ils sont dissimulés dans des images apparemment ' +
      'anodines. Le regard suffit rarement à les trouver.',
    scenes: [
      'Une fresque représente un paysage nocturne. En observant la régularité des pixels, ' +
        'le voyageur distingue des motifs répétés.',
      'Un code couleur discret encode une phrase entière ; les variations les plus faibles ' +
        'portent l’information la plus importante.'
    ],
    revelation:
      'Ce qui semble être du bruit peut être un langage. La stéganographie apprend à lire ' +
      'entre les pixels.'
  }),
  chapter({
    slug: 'le-protocole-etoile',
    title: 'Le protocole Étoile',
    order: 10,
    requiredLevel: 9,
    arc: 'Arc IV — Le noyau',
    intro:
      'Le protocole Étoile relie les provinces par des symboles carrés. Chaque symbole décrit ' +
      'une identité, une instruction et une vérification.',
    scenes: [
      'Le voyageur apprend à lire les quatre coins d’un symbole comme une grille de décisions. ' +
        'Une seule case modifie complètement le message.',
      'Les gardiens du protocole vérifient l’intégrité avant de transmettre : un symbole abîmé ' +
        'est rejeté sans appel.'
    ],
    revelation:
      'Un format bien défini rend la communication fiable même entre interlocuteurs qui ne ' +
      'se sont jamais rencontrés.'
  }),
  chapter({
    slug: 'le-coeur-du-systeme',
    title: 'Le cœur du système',
    order: 11,
    requiredLevel: 10,
    arc: 'Arc IV — Le noyau',
    intro:
      'Sous la Grille se trouve un moteur qui conserve tout ce qui a été résolu. Il ne juge pas, ' +
      'il enregistre et restitue.',
    scenes: [
      'Le voyageur voit les scores afflués de milliers de parties se transformer en une ' +
        'mémoire commune, triée et consolidée.',
      'Des portes parallèles s’ouvrent en même temps : le moteur doit les traiter sans ' +
        'confondre leurs états.'
    ],
    revelation:
      'Un système durable sépare ce qui change vite de ce qui doit rester exactement vrai.'
  }),
  chapter({
    slug: 'ultime-compilation',
    title: 'L’ultime compilation',
    order: 12,
    requiredLevel: 12,
    arc: 'Arc IV — Le noyau',
    intro:
      'Tous les chemins de la Grille convergent vers une dernière salle. Les leçons, les défis, ' +
      'les archives et les boss y sont rassemblés en une seule épreuve.',
    scenes: [
      'Le voyageur comprend que chaque compétence acquise plus haut est un outil : trier, ' +
        'déboguer, déchiffrer, mesurer, persister.',
      'La porte finale ne demande pas d’être le plus rapide, mais d’être capable de choisir ' +
        'la bonne méthode au bon moment.'
    ],
    revelation:
      'La compilation est terminée lorsque la Grille devient lisible sans être ouverte : ' +
      'son fonctionnement est devenu une évidence.'
  })
];
