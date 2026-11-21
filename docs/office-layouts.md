# Plans de bureau

Une partie se joue dans un **plan** : une disposition de la pièce (8,4 × 7,2 m,
même taille pour tous). Le plan est choisi par le premier joueur qui crée la room
(carte « Plan du bureau » de l'accueil, ou `?plan=<id>`), puis fixé pour toute la
vie de la room. Un joueur qui rejoint un code existant utilise le plan de cette
room, quel que soit son choix. Le dernier choix est mémorisé dans le navigateur
(`moucheron-plan`) et l'accueil montre le plan choisi en arrière-plan.

## Plans

| id                 | Idée                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `diagonale`        | Défaut. Corbeille au fond à droite, entrées à l'opposé, couloir derrière les archives.                 |
| `ilots`            | Corbeille au centre, quatre îlots de bureaux, entrées dans les coins (≈ 4 m de la cible).              |
| `cloison`          | Cloison pleine coupant la pièce ; une seule porte pour le sol et l'air.                                |
| `fronts`           | Corbeille au fond au centre ; le sol arrive par la gauche, l'air par la droite.                        |
| `archives`         | Trois rayonnages en quinconce : le sol serpente, trois entrées de longueurs différentes.               |
| `bureau-direction` | Corbeille posée sur un bureau de direction ; le sol y accède par-dessous (bureaux ouverts côté pièce). |

Tous : 3 trous au sol et 4 bouches d'aération sur les murs gauche, droit ou du
fond (la pièce n'a pas de mur avant) ; passages bouchables de 0,5 à 0,9 m ; sol
et air visent la même corbeille. Les durées d'arrivée en l'air valent environ
3 fois celles du sol : chaque vent fait un tour de pièce (circuit à ≈ 2 m de
haut, sous la couche de nuages) avant de plonger vers la corbeille.

## Décor : le Cartoon Office Pack

Depuis la version 401, chaque plan est meublé avec les modèles du **Cartoon Office
Pack** de BloxBits (pack acheté, licence et import : [pipeline des
assets](asset-pipeline.md#cartoon-office-pack-bloxbits)). `diagonale` est le bureau
complet de référence : îlots de postes de travail encombrés, archives et leur
couloir, tableau blanc, coin cuisine avec distributeur, coin attente, porte et son
couloir, habillage mural (horloge, calendrier, tableau en liège, extincteur, prises)
et désordre au sol (boules de papier autour de la corbeille). Les cinq autres plans
reprennent leurs volumes de jeu avec les mêmes meubles, en version plus sobre.

- **Liste finie, placée à la main.** Chaque objet d'un plan est écrit dans
  `src/layouts.ts` ; il n'y a aucun tirage aléatoire (le test le vérifie). Si
  l'aléatoire vient un jour, il portera sur toute la carte, pas sur le seul désordre.
- **Proportions du pack conservées.** Une seule échelle uniforme : un module de mur
  du pack mesure exactement 1,2 m, la pièce fait donc 7 × 6 modules (8,4 × 7,2 m).
  Les volumes de jeu s'adaptent aux meubles, jamais l'inverse (bureau 1,51 × 0,76 m,
  plateau à 0,74 m ; bibliothèque 1,8 m ; panneau de box 1,4 m).
- **Murs.** Modules du pack, face intérieure exactement sur les limites de la pièce
  (x = ±4,2, z = −3,6), 2,7 m de haut avec plinthes ; fenêtres au fond (`windows`
  choisit les modules), une porte de bureau fermée dans un module à elle (`door`),
  loin des entrées. Le haut des murs se fond dans les nuages : `OFFICE_CLOUD_TOP`
  vaut la hauteur des murs (2,7 m) et le voile commence toujours à 2,2125 m, donc
  les trajectoires des ennemis n'ont pas bougé.
- **Entrées collées au mur.** Chaque bouche d'aération est la grille du pack, posée
  à fleur de la face du mur et centrée sur son entrée ; chaque trou de souris est une
  arche sombre sur la plinthe, au pied du mur.
- **Sol uni**, sans lattes ni dalles.

## Données et code

`src/layouts.ts` est la seule source : données pures (pas de Three.js), importées
par le client, le serveur Node et les Web Workers.
Chaque plan décrit :

- `props` : les modèles placés à la main, avec `put(modèle, x, z, orientation,
{ y, kind, label })`, `onProp`/`besideProp` (relatif à un bureau : écran, clavier,
  chaise…), `onWall` (objet mural) et les assemblages `station`, `island`,
  `partition` (murs intérieurs). Un modèle regarde +X dans son repère ; `FACE`
  donne l'orientation vers `east`, `north`, `west` ou `south`. `kind` et `label`
  font figurer le meuble sur la vignette ;
- `door` (mur et module de la porte) et `windows` (modules vitrés du fond) ;
- `furniture` (facultatif) : volumes colorés alignés sur les axes, pour ébaucher un
  plan avant de le meubler (`FURNITURE_KINDS`) ;
- `bin` (position, `y` = hauteur du support), `groundGoal` (où les rampants
  s'arrêtent au sol) et `groundFinish` (la montée finale) ;
- `portals.ground` / `portals.air`, et `airRoutes` (waypoints par vent, y
  compris le tour de circuit) ;
- `base` : origine de la zone d'apparition au sol près de la corbeille (la
  « base » n'est plus matérialisée : pas de piste, plus de bureau de départ) ;
- `hidden` et `passages` : repères pour la vignette/revue, sans effet de jeu.

Le plan construit expose aussi `props` complet (coque, bouches, corbeille et objets)
et `shellSolids` (corps des murs et plinthes). Les **boîtes de collision** des
modèles viennent de `src/office-props.ts` : boîtes mesurées sur le modèle pour les
meubles sous lesquels on passe (bureau : plateau, caisson, panneau ; table basse ;
comptoir sans son robinet), boîte englobante pour les autres, aucune pour les petits
objets (moins de 15 cm de côté) et les objets plats au mur. Elles suivent l'orientation
du modèle ; les boîtes jointives (rangée de bibliothèques, murs) sont fusionnées pour
ne laisser aucune couture où un insecte resterait accroché.

`layoutPieces(layout)` produit les primitives (sol, volumes d'ébauche) et les
boîtes des modèles ; les colliders sont exactement ces boîtes (`layoutSolids`).
`office.js` dessine le sol, les ébauches et les modèles (`office-pack.ts` : un
`InstancedMesh` par modèle, un seul matériau pour tout le pack). Les modules lisent la disposition **active**
(`activeLayout()`) : `OFFICE_LAYOUT`, `PORTALS`, `groundGoal()`,
`groundStaticObstacles()`, `staticGroundFlow()`, `enemyRoute()` et
`blockedSegment()` suivent le plan actif, et leurs caches sont indexés par id de
plan. Le serveur active le plan de la room avant chaque opération
(`Game.use(room)`), le client à la connexion ou au choix dans l'accueil
(`applyLayout`). Le snapshot porte `layout` (id).

## Ajouter ou modifier un plan

1. Ajouter l'entrée dans `LAYOUTS` (`src/layouts.ts`) ; orienter les meubles solides
   par quarts de tour (la navigation au sol utilise des boîtes alignées). Un petit
   objet peut prendre n'importe quel angle.
2. Garder les entrées sur les murs, loin de la corbeille, jamais dans un meuble ;
   laisser le pied de la corbeille, l'apparition et la sortie des couloirs libres (un
   goulet trop serré empile les fourmis : `test-ground-spread`).
3. Pour un modèle du pack pas encore importé, l'ajouter à `MODELS` dans
   `scripts/import-office-pack.py` et relancer l'import (source hors Git).
4. `node scripts/test-layouts.mjs` vérifie routes au sol et en l'air, absence de
   traversée de meuble, hauteur sous les nuages, colliders et arrivée physique de
   fourmis depuis chaque trou. `node scripts/test-office-pack.mjs` vérifie les murs,
   les bouches et trous collés, la porte, l'absence de chevauchement entre objets
   solides, les objets posés sur les bureaux et l'absence de modèle importé inutilisé.
   `node scripts/e2e-layouts.mjs` (navigateur réel, hors `npm test`) vérifie le
   sélecteur et la règle « la room garde son plan ».

## Limites connues

- Essais UDP réels non faits ; le décor a été vérifié en rendu WebGL logiciel
  (captures), pas encore en vraie partie ni sur un vrai GPU.
- Seul `diagonale` est un bureau complet ; les cinq autres plans attendent leur
  aménagement détaillé.
- Panneaux du pack en anglais (« RECEPTION », « ACCOUNTING »…) non utilisés tant
  qu'ils ne sont pas retexturés en français.
- Les stations fixes historiques (`AA_STATIONS`) restent sur le plan par défaut.
- Les plans `ilots` et `fronts` ne respectent pas la distance de 6 m entre entrées
  et corbeille (impossible au centre).
