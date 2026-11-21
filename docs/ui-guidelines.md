# Règles d’interface

Référence pour tout ce qui informe le joueur ou lui permet d’agir : HUD, menus,
documents, objets interactifs, sons d’état. Elle applique le pilier « le monde est
l’interface » de la [direction artistique](art-direction.md). Les composants actuels se
voient sur la page **Écrans intégrés** du site. Les éléments marqués **à venir**
sont décidés mais pas encore en jeu.

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
| Argent (caisse commune) | Tas de pièces ou de billets dans la base ; solde sur le bon de commande.          |
| Munitions               | Son du tir qui change en fin de bande ; caisses ou bandes visibles qui se vident. |
| Carburant               | Moteur qui tousse ou ratés ; jauge au tableau de bord en vue cockpit.             |
| Dégâts                  | Fumée, trous, pièces qui pendent, bruits de moteur ; jamais une simple barre.     |
| Infestation, poubelle   | Insectes visibles sur la poubelle, couvercle qui se soulève, bruit de nuée.       |
| Poste libre ou occupé   | Personnage visible à son poste ; contour au survol ; tableau des fiches en T.     |

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
- **Rien ne ressemble à un formulaire HTML** : pas de case, bouton radio ni bouton
  système visibles.
- **Cocher** se fait au clic et laisse une coche manuscrite, au crayon ou au stylo,
  légèrement irrégulière. Aucune case n’est cochée d’office ; un formulaire peut exiger
  une ou plusieurs coches avant signature.
- **Signer** se fait à la souris, en traçant sa signature (mécanisme existant :
  [signatures](economy-physics.md#input-and-signatures)) ; c’est le geste qui valide, à
  la place d’un bouton.

En jeu sur le **bon de commande** de l’atelier (`src/purchase-ui.js`) : feuille de papier,
motif obligatoire à cocher (`PURCHASE_MOTIVES`), solde de la caisse commune avant et après,
signature, puis tampon « APPROUVÉ ». La clause « Convenance personnelle » est réellement
refusée : tampon « REFUSÉ », aucune commande envoyée, et il faut recommencer depuis l’atelier.
Le composant partagé (cases dessinées, coche au crayon, tampons) est `src/paper-form.ts` ;
ses jetons (`--paper`, `--ink`, `--pencil`, `--stamp-ink`, `--typewriter`) sont dans
`src/index.html`. Le dossier d’embarquement, le lit et le banquier suivront.

L’interface HTML actuelle (panneaux vert sombre génériques) est héritée ; chaque
reprise d’un écran va vers ce modèle.

## Monter dans un engin : viser le poste

On monte en **visant le poste lui-même** (verrière du pilote, tourelle, trappe), pas un
rond au sol : seul un objet réel est interactif, et l’engin s’aborde par tous les côtés.

- **Survol** : le poste visé prend un contour **bleu signal** s’il est libre ; s’il est
  occupé, un contour neutre et le nom de l’occupant.
- **Clic** : le formulaire de prise de poste s’ouvre ; sa signature fait monter.
- Une seule manière d’atteindre un poste : on vise ce poste. Viser le reste de
  l’appareil ne fait rien (piste écartée pour l’instant).
- **Zones de visée généreuses**, plus grandes que le maillage, pour les postes difficiles
  à viser (ventral, queue) ; une **portée** limitée oblige à s’approcher de l’engin.
- **Aucun indice permanent** : pas de clignotement ni de reflet ; le survol suffit.
- Les ronds au sol et les pictogrammes de rôle (`src/seat-icons.ts`) sont hérités et
  disparaissent engin par engin ; le nom du poste s’écrit en toutes lettres dans les
  documents (« Mitrailleur ventral »). Les autres ronds (stations, lits, banque…)
  suivent le même principe : on vise l’objet.

En jeu sur le **bombardier moyen** (pilote, mitrailleurs dorsal, ventral et de queue) :
postes et zones de visée dans `src/seat-posts.ts`, contour dans `src/post-highlight.ts`. Le
contour est tracé à l’écran, par-dessus l’image, autour de la silhouette du poste (comme les
contours du [rendu dessin animé](toon-rendering.md)) : aucun volume n’est ajouté au modèle.
Le clic gauche, ou la touche d’interaction, sur le poste visé ouvre son dossier ; le
serveur vérifie seulement que le joueur se tient près de l’appareil. Les autres engins
gardent leurs ronds jusqu’à leur passage.

## Équipage : les fiches en T (à venir)

Le panneau qui liste l’équipage d’un engin devient un **planning à fiches en T**, comme
dans l’industrie : une fente par poste, au nom du poste, et une fiche au nom de chaque
membre d’équipage.

- Le tableau sort **à la demande**, en bas de l’écran, quand on est dans un engin.
- Une fente vide est un poste libre ; on lit d’un coup d’œil qui est où.
- **Changer de poste** : déplacer sa fiche vers une fente libre.
- Déposer sa fiche sur une fente occupée **demande un échange**, que l’autre accepte
  d’un geste.
- **Retirer sa fiche et la lâcher fait sauter de l’engin** ; la touche de parachute
  reste disponible.

## Jetons visuels

Couleurs, polices, tailles, espacements et rayons se définissent **une seule fois** en
variables CSS (`:root` de `src/index.html`) et se réutilisent partout, y compris dans le
JavaScript. État hérité à résorber : environ 290 couleurs écrites en dur dans `src/`,
une vingtaine de tailles de texte, quatre polices et des rayons de 3 à 12 px.
Une nouvelle couleur ou taille écrite en dur n’est pas acceptée ; toute reprise d’écran
migre ses valeurs vers les jetons. Le **bleu signal `#2ec4d6`** est le jeton partagé par
l’interface et le monde 3D pour tout ce qui s’utilise ([couleurs](art-direction.md#couleurs)).

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
- Ce qui s’utilise est-il un objet réel, signalé au survol par le bleu signal ?
- Le texte suit-il le [ton des textes](art-direction.md#ton-des-textes) ?
