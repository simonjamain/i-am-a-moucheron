# Plans de bureau

Une partie se joue dans un **plan** : une disposition de la pièce (8,4 × 7,2 m,
même taille pour tous). Le plan est choisi par le premier joueur qui crée la room
(carte « Plan du bureau » de l'accueil, ou `?plan=<id>`), puis fixé pour toute la
vie de la room. Un joueur qui rejoint un code existant utilise le plan de cette
room, quel que soit son choix. Le dernier choix est mémorisé dans le navigateur
(`moucheron-plan`) et l'accueil montre le plan choisi en arrière-plan.

## Plans

| id                 | Idée                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `diagonale`        | Défaut. Corbeille au fond à droite, entrées à l'opposé, couloir derrière les archives.      |
| `ilots`            | Corbeille au centre, quatre îlots de bureaux, entrées dans les coins (≈ 4 m de la cible).   |
| `cloison`          | Cloison pleine coupant la pièce ; une seule porte pour le sol et l'air.                     |
| `fronts`           | Corbeille au fond au centre ; le sol arrive par la gauche, l'air par la droite.             |
| `archives`         | Trois rayonnages en quinconce : le sol serpente, trois entrées de longueurs différentes.    |
| `bureau-direction` | Corbeille posée sur un bureau de direction ; le sol y accède par deux rampes (jupe percée). |

Tous : 3 trous au sol et 4 bouches d'aération sur les murs gauche, droit ou du
fond (la pièce n'a pas de mur avant) ; passages bouchables de 0,5 à 0,9 m ; sol
et air visent la même corbeille. Les durées d'arrivée en l'air valent environ
3 fois celles du sol : chaque vent fait un tour de pièce (circuit à ≈ 2 m de
haut, sous la couche de nuages) avant de plonger vers la corbeille.

## Données et code

`src/layouts.js` est la seule source : données pures (pas de Three.js), importées
par le client, le serveur Node, les workers et le bundle Worker historique.
Chaque plan décrit :

- `furniture` : volumes alignés sur les axes (`kind`, centre `x`/`z`, taille
  `w`/`d`), les hauteurs viennent de `FURNITURE_KINDS` (bureau, rayonnage,
  cloison basse, paravent, mur plein, carton, photocopieuse, fontaine, plante,
  tapis non solide, jupe de bureau) ;
- `bin` (position, `y` = hauteur du support), `groundGoal` (où les rampants
  s'arrêtent au sol) et `groundFinish` (la montée finale) ;
- `portals.ground` / `portals.air`, et `airRoutes` (waypoints par vent, y
  compris le tour de circuit) ;
- `base` : origine de la zone d'apparition au sol près de la corbeille (la
  « base » n'est plus matérialisée : pas de piste, plus de bureau de départ) ;
- `hidden` et `passages` : repères pour la vignette/revue, sans effet de jeu.

`layoutPieces(layout)` produit les primitives dessinées (`office.js`) ; les
colliders sont exactement leurs boîtes (`layoutSolids`) : plus de fichier généré
`route-obstacles.js`. Les modules lisent la disposition **active**
(`activeLayout()`) : `OFFICE_LAYOUT`, `PORTALS`, `groundGoal()`,
`groundStaticObstacles()`, `staticGroundFlow()`, `enemyRoute()` et
`blockedSegment()` suivent le plan actif, et leurs caches sont indexés par id de
plan. Le serveur active le plan de la room avant chaque opération
(`Game.use(room)`), le client à la connexion ou au choix dans l'accueil
(`applyLayout`). Le snapshot porte `layout` (id).

## Ajouter ou modifier un plan

1. Ajouter l'entrée dans `LAYOUTS` (`src/layouts.js`) ; éviter les rotations
   (la navigation au sol utilise des boîtes alignées).
2. Garder les entrées sur les murs, loin de la corbeille, jamais dans un meuble ;
   laisser le pied de la corbeille et l'apparition libres.
3. `node scripts/test-layouts.mjs` vérifie routes au sol et en l'air, absence de
   traversée de meuble, hauteur sous les nuages, colliders et arrivée physique de
   fourmis depuis chaque trou. `node scripts/e2e-layouts.mjs` (navigateur réel,
   hors `npm test`) vérifie le sélecteur et la règle « la room garde son plan ».

## Limites connues

- Essais WebGL et UDP réels non faits ; le rendu des plans est un blocage en volumes
  simples (une couleur par type), sans modèles détaillés.
- Les stations fixes historiques (`AA_STATIONS`) et le Worker historique
  (`src/server.js`) restent sur le plan par défaut.
- Les plans `ilots` et `fronts` ne respectent pas la distance de 6 m entre entrées
  et corbeille (impossible au centre).
