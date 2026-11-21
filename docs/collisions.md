# Collisions sur les triangles du décor

Le décor du bureau collisionne sur les **vrais triangles** de ses modèles (Cartoon
Office Pack, voir [plans de bureau](office-layouts.md)), et non plus sur des boîtes
approchées. À l'échelle d'un moucheron, chaque surface compte : rase-mottes,
véhicules, atterrissages, et bientôt les trains d'atterrissage à suspension. Le
travail avance par lots (note de reprise : [collisions en triangles](tasks/collision-triangles.md)).

## Principe

- **Un BVH par modèle** (`src/collision-mesh.ts`, sans Three.js, partageable avec
  le serveur et les workers) : arbre de boîtes englobantes sur les triangles du
  modèle, construit une fois, dans le repère du modèle.
- **Un solide maillé par objet posé** (`MeshSolid`, `src/office-collision.ts`) : ses
  bornes dans la pièce servent de tri rapide, et son repère (position, lacet) ramène
  chaque requête dans le repère du modèle. Les copies d'un même modèle partagent
  son BVH.
- **Requêtes** : rayon (point d'impact le plus proche, normale tournée vers le rayon)
  et point le plus proche dans un rayon donné (contact d'une sphère). Le balayage
  d'une forme le long d'un trajet viendra avec le vol (lot 3).

## Ce qui collisionne

| Modèles                                                                                                                             | Forme                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tous par défaut (meubles, objets de bureau, clavier et ses touches, photocopieuse et sa fente de sortie, ventilateurs et leur tige) | triangles du modèle                                                       |
| Piles de feuilles, boules de papier                                                                                                 | boîtes de `office-props.ts` (beaucoup de petits coins, approximés exprès) |
| Bouches d'aération, porte, feuille isolée au sol                                                                                    | rien : à fleur du mur de la coque, ou à plat                              |
| Murs de la coque (modules du pack)                                                                                                  | boîtes de la coque (`shellSolids`), faces exactes                         |

## Lots

1. **Monde de collision en triangles** (version 406) : construction, requêtes exactes,
   affichage en mode debug. Les boîtes restent les solides du jeu pendant ce lot.
2. Tirs, visée de pose, caméra, largages : rayons sur les triangles.
3. Avions, marche et véhicules au contact des triangles.
4. Navigation des fourmis et serveur.

## Mode debug

Avec **Debug : ON**, les triangles de collision des objets sont dessinés en fil de
fer jaune (`MESH_COLLIDER_COLOR`), en plus des boîtes cyan
([mode debug](laboratory.md)).

## Mesures

Node 22, Diagonale :

| Mesure                                                   | Valeur      |
| -------------------------------------------------------- | ----------- |
| Solides maillés / triangles                              | 79 / 80 168 |
| Construction des BVH (première fois, tous les modèles)   | 120 ms      |
| Construction suivante (BVH en cache)                     | 0,2 ms      |
| Rayon à travers toute la pièce (tri par bornes puis BVH) | 10 µs       |
| Contact d'une sphère de 5 cm                             | 0,7 µs      |

`scripts/test-collision-mesh.mjs` compare chaque rayon à un test sur tous les
triangles (aucun écart), vérifie les points les plus proches, les objets tournés, les
formes approchées et la fente de la photocopieuse, qui reste ouverte.
