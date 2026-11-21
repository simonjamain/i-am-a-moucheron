# Règles d’interface

Référence pour tout ce qui informe le joueur ou lui permet d’agir : HUD, menus,
marquages au sol, pictogrammes, sons d’état. Elle applique le pilier « le monde est
l’interface » de la [direction artistique](art-direction.md). Les composants actuels se
voient sur la page **Écrans intégrés** du site. Les sections **(proposition)** restent à
valider ; le reste est décidé.

## Principe : le monde avant le HUD

Pour chaque information, se poser la question dans cet ordre et retenir le premier
niveau qui suffit :

1. **Dans le monde** : un objet, une animation ou un son la montre (voile gonflée,
   moteur qui tousse, caisse de munitions qui se vide, hélice qui ralentit).
2. **Sur un document** : elle apparaît quand le joueur agit, sur un objet qui sort du
   monde (le solde sur le bon de commande au moment d’acheter).
3. **Dans le HUD** : uniquement si les deux premiers niveaux échouent, de façon
   discrète et temporaire si possible.

Contrainte acceptée : une information du monde demande parfois d’aller la voir ; c’est
voulu, tant que l’information vitale reste accessible quand on en a besoin.

### HUD permanent

Seul le **viseur** est permanent. Tout le reste doit justifier sa présence à l’écran.

### Pistes par information

| Information             | Pistes dans le monde ou sur un document                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| Vague, compte à rebours | Aiguille d’une horloge murale, affiche ou planning au mur, sirène.                |
| Argent                  | Tas de pièces ou de billets visible dans la base ; solde sur le bon de commande.  |
| Munitions               | Son du tir qui change en fin de bande ; caisses ou bandes visibles qui se vident. |
| Carburant               | Moteur qui tousse ou ratés ; jauge au tableau de bord en vue cockpit.             |
| Dégâts                  | Fumée, trous, pièces qui pendent, bruits de moteur ; jamais une simple barre.     |
| Infestation, poubelle   | Insectes visibles sur la poubelle, couvercle qui se soulève, bruit de nuée.       |
| Poste libre ou occupé   | Marquage au sol et pictogramme ; personnage visible à son poste.                  |

Ces pistes s’évaluent au cas par cas ; une bonne idée nouvelle s’ajoute ici.

## Menus : des documents qui sortent du monde

Les menus sont des **objets** (formulaires, dossiers, bons de commande, registres) qui
sortent d’une machine, d’un guichet ou d’un bureau et viennent devant la caméra, à la
manière d’_Astroneer_. Ils parlent la langue de l’administration militaire : champs à
remplir, signatures, tampons, cachets « APPROUVÉ ».

- Un menu s’ouvre en interagissant avec l’objet qui le porte, pas depuis un bouton
  flottant ; une touche de raccourci peut l’ouvrir s’il existe un objet cohérent.
- Il se ferme toujours par **Échap** et par le même geste qu’à l’ouverture.
- Il ne masque pas plus de scène que nécessaire ; le jeu continue derrière lui.
- Un seul style de document pour tout le jeu (papier, typographie, tampons), défini par
  les jetons de l’interface.

L’interface HTML actuelle (panneaux vert sombre génériques) est héritée ; chaque
reprise d’un écran va vers ce modèle.

## Pictogrammes des postes (proposition)

Les ronds d’accès aux sièges forment un **système** commun à tous les engins
(`src/seat-icons.ts`) :

- **Un pictogramme de base par rôle** : pilote, conducteur, mitrailleur, canon,
  copilote, passager.
- **Un modificateur** quand un engin a plusieurs postes du même rôle : flèche vers le
  haut (dorsal), vers le bas (ventral), vers l’arrière (queue), etc.
- **Un placement qui informe** : le rond se trouve près du poste réel (le ventral sous le
  ventre, le mitrailleur de queue derrière l’appareil).
- **Un état lisible** : libre, occupé, occupé par moi, avec le même code partout.
- Piste : rendre le rond plus intégré au monde, comme un marquage au sol au ruban
  adhésif, valable dans toute pièce.

Le bombardier moyen (pilote, mitrailleurs dorsal, ventral et de queue) sert de cas de
test : chaque poste doit se distinguer sans lire de texte.

## Jetons visuels

Couleurs, polices, tailles, espacements et rayons se définissent **une seule fois** en
variables CSS (`:root` de `src/index.html`) et se réutilisent partout, y compris dans le
JavaScript. État hérité à résorber : environ 290 couleurs écrites en dur dans `src/`,
une vingtaine de tailles de texte, quatre polices et des rayons de 3 à 12 px.
Une nouvelle couleur ou taille écrite en dur n’est pas acceptée ; toute reprise d’écran
migre ses valeurs vers les jetons. Les valeurs elles-mêmes suivront la palette par rôle
de la [direction artistique](art-direction.md#couleurs-par-rôle-proposition).

## Interactions

- **Échap** ferme le document ou menu ouvert ; sinon il libère le curseur.
- Un raccourci clavier est affiché sur l’objet ou le document qu’il ouvre, pas dans une
  légende permanente.
- Toute action qui coûte (achat, signature) se confirme par un geste explicite (signer,
  tamponner) et donne un retour visible et sonore.
- Le focus clavier est toujours visible dans les documents.
- Commandes détaillées et prise du pointeur : [commandes](controls.md).

## Accueil du nouveau joueur

Chantier ouvert, plus large que le design : un joueur qui arrive ne sait pas quoi faire
ni quand (préparation, début de vague, mort, retour). Principe retenu : le monde montre
ce qui attend le joueur (ce qui s’allume, sonne ou l’attend) plutôt qu’un tutoriel en
texte ; les étapes restent à concevoir.

## Vérifier un écran ou une information

- Peut-elle passer par le monde ou le son plutôt que par le HUD ?
- Le menu est-il un document qui sort d’un objet, et se ferme-t-il avec Échap ?
- Utilise-t-il uniquement les jetons visuels ?
- Les pictogrammes respectent-ils le système des postes ?
- Le texte suit-il le [ton des textes](art-direction.md#ton-des-textes) ?
