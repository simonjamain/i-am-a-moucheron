# Ciel du purgatoire

Le bureau et le purgatoire sont un seul monde
([un seul monde](walking-network.md#un-seul-monde-pour-le-bureau-et-le-purgatoire)) :
au-dessus de la couche nuageuse du bureau s’étend le ciel bleu de Saint Pierre, et son
nuage y flotte environ 150 m réels plus haut. On y monte en vol, on s’y pose, on y tire,
on en redescend. Décor : [décor du purgatoire](purgatory-scene.md) ; file et guichets :
[file du purgatoire](purgatory-queue.md).

Code :

- `src/sky-passage.ts` : plancher du ciel, passage, blanc de la traversée, solides du nuage ;
- `src/sky-targets.ts` : cibles des tirs ;
- `src/purgatory-scene.ts` : lieu, brume du ciel ;
- `src/purgatory-queue.ts` : `STAFF_HP`, `isStaff`, guichets fermés ;
- `server/game.js` : `purgatoryHit`, `soulBoard`, état `staff` ;
- `client.js` : `setSkyView`, `flightPassage`, `purgatoryTargets`, `soulBoardingPosts`.

## La mort, un passage

Mourir n’est qu’une téléportation vers le nuage de Saint Pierre, et signer chez lui une
téléportation vers le bas (lit ou zone de départ) : là-haut, un joueur reste une personne
comme au bureau.

- **Mourir** (au bureau, dans le ciel ou au purgatoire) : la caméra reste sur la scène, le
  personnage monte en fantôme translucide, la caméra le suit, puis fondu au noir ; le
  client entre seul au purgatoire et le fondu s’ouvre sur l’âme (`startDeathSequence`,
  `updateDeathSequence` dans `client.js`).
- L’âme apparaît près du canapé côté VIP (`SOUL_ENTRANCE`).
- **Descendre d’un appareil posé sur le nuage, c’est rejoindre la file** (`toPurgatory`) :
  on apparaît là où l’on est sorti, sans passage, et signer chez Saint Pierre redescend
  au bureau, même sans avion.
- **Remonter dans un appareil posé** se fait d’un clic (`soul-board`) ; on redescend en
  volant.
- **Dans le ciel, ni banque, ni atelier, ni construction**, mort ou vivant (`inHeaven`,
  boutons masqués, aide sans N ni G).

## Monter et redescendre

- **Pas de plafond de vol.** Le plancher du ciel (`SKY_FLOOR`, 3,95 m du bureau) sépare
  les deux lieux. En dessous, les murs de la pièce bornent le vol (contacts du moteur pour les avions, `outOfFlight` pour les hélicoptères) ;
  au-dessus, le ciel n’a de limite ni en hauteur ni sur les côtés.
- **La traversée blanchit** (`passageWhiteness`, voile `#altitudeFog` devant l’image) : le
  voile du bureau s’épaissit jusqu’au blanc complet au plancher du ciel, puis s’éclaircit
  sur environ 60 m réels au-dessus (`SKY_PASSAGE`).
- **En montant**, le point de la pièce sous l’appareil est retenu (`flightEntry`, ramené à
  l’intérieur des murs). **En redescendant** sous le plancher du ciel, l’appareil est
  replacé au-dessus de ce point, juste sous le plancher, avec sa vitesse et son
  orientation. Sans point d’entrée (une âme qui a embarqué là-haut), on retombe au-dessus
  de la base.
- **Un marcheur qui tombe du nuage** (le bord n’a pas de mur pour les vivants) retombe
  de même au-dessus de la base, en chute libre : Espace ouvre le parachute.
- Les appareils garés vides, simulés par le serveur (`src/parked-host.ts`), suivent les
  mêmes règles.

## Ce que l’on voit

- Une seule scène : le décor du purgatoire (`purgatory.place`) est ajouté à celle du
  bureau. Selon l’altitude de la caméra (`inSky`), `setSkyView` montre le purgatoire
  (dôme, nuage de Saint Pierre, lumière et brume du ciel) ou le bureau (pièce, lampes,
  brume du bureau). Appareils, tirs et joueurs sont les mêmes objets.
- **Du bleu partout, même sous ses pieds** : le dôme est bleu aussi sous l’horizon. Vu
  d’en haut, la couche nuageuse du bureau ne se voit pas : la brume du ciel
  (`createSkyFog`) fond dans la couleur du ciel tout ce qui est sous le plancher du ciel
  (sur 30 m réels) ou au-delà de 400 m à 2,5 km réels. C’est en plongeant vers le
  plancher que le blanc de la traversée envahit la vue.
- Les vivants dans le ciel voient les âmes, Saint Pierre et le vigile, avec leurs barres
  de vie ; les âmes voient les appareils et les vivants qui marchent sur le nuage.

## Se poser, marcher, embarquer

- Le nuage et le guichet sont des solides (`purgatorySolids`) partagés par le client et
  le serveur : les appareils s’y posent et ne traversent pas son ventre, les vivants y
  marchent comme au bureau. Saint Pierre et le vigile ignorent les vivants : seules les
  âmes font la file.
- **Rien ne se construit dans le ciel** (`buildableAltitude`) : constructions, pose d’un
  achat et largages du Castor volant sont refusés au-dessus du plancher du ciel.
- **Une âme embarque** dans un appareil posé dans le ciel, sur une place libre à moins de
  8 m : le viser l’entoure de bleu, un clic (`soul-board`) lui fait quitter la file pour
  ce poste, sans formulaires.
- **Refuge** : les insectes suivent leurs couloirs sous les nuages et ne poursuivent
  personne ; aucun ne monte dans le ciel.
- **Mourir là-haut** est une mort ordinaire : l’âme rejoint la file.

## Tirer dans le ciel

Les tirs des vivants (balles, obus de DCA, bombes, roquettes, missiles) touchent dans le
ciel les âmes d’insectes de la file, Saint Pierre et le vigile (`purgatoryTargets`,
sphères ; balles : `nearestSkyTarget`, explosions : `skyBlast`, dégâts de souffle usuels).
Le tireur rapporte ses coups (`purgatory-hit`), comptés une fois par tir et par cible.

- **Une âme d’insecte touchée est libérée aussitôt**, comme servie au guichet : elle
  rapporte sa récompense à l’équipe. Un bombardier peut vider la file.
- **Saint Pierre et le vigile ont 10 000 points de vie** (`STAFF_HP`). Tué, chacun rejoint
  la file comme une âme, avec son propre modèle.
  - Le vigile mort ferme l’accès VIP (coupe-file et guichet VIP refusés). Son âme est
    servie comme un insecte, puis il revient à son poste, sans récompense.
  - Saint Pierre mort ne sert plus personne : plus de résurrection ni de tampon. Son âme
    entre par la file VIP et attend devant le guichet VIP vide (`saintIntent`). Il faut la
    tuer à nouveau (10 000 points de plus) ; il revient alors derrière son bureau.
- Le rôle du vigile s’appelle `vipGuard` (`STAFF_ROLES`) : `guard` est l’abeille.
- Les âmes des joueurs ne sont jamais blessées, et les âmes ne tirent pas.

## Vérifier

- `scripts/test-purgatory-sky.mjs` : passage (montée, descente au point d’entrée ou
  au-dessus de la base) et blanc de la traversée ; refuge et solides communs ; cibles et
  souffle ; côté serveur, âmes libérées une seule fois et payées, personnel tué puis
  rendu, guichets fermés, âmes non blessées et désarmées, embarquement, constructions
  refusées.
- `scripts/test-office-clouds.mjs` : absence de plafond.
- `scripts/e2e-purgatory-walk.mjs` : le purgatoire dans la scène unique.

Restent à essayer en partie réelle : la montée en vol, et le coût des nuages
volumétriques du ciel sur une carte graphique.
