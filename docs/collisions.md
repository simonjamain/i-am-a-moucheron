# Collisions sur les triangles du décor

Le décor du bureau collisionne sur les **vrais triangles** de ses modèles (Cartoon
Office Pack, voir [plans de bureau](office-layouts.md)), et non plus sur des boîtes
approchées. À l'échelle d'un moucheron, chaque surface compte : rase-mottes,
véhicules, atterrissages, et bientôt les trains d'atterrissage à suspension. Le
travail avance par lots (note de reprise : [collisions en triangles](tasks/collision-triangles.md)).

## Principe

- **Rapier**, le moteur physique déjà utilisé par les véhicules
  ([moteur physique](physics-engine.md)), porte le décor : `DecorCollision`
  (`src/office-collision.ts`) crée un monde Rapier par plan, avec un collider fixe
  en triangles (`trimesh`) par objet posé, à sa position et sa rotation. Rapier
  garde sa propre structure d'accélération ; aucun moteur de collision maison.
- **Unités** : le monde Rapier est à l'échelle humaine (`toPhysics`, comme les
  véhicules) ; les requêtes prennent et rendent des mètres du jeu.
- **Requêtes** : rayon (impact le plus proche, sur tout le décor ou un seul objet,
  normale tournée vers le rayon) et point le plus proche. Le balayage d'une forme le
  long d'un trajet (`castShape`) viendra avec le vol (lot 3).
- **Côté client seulement** : la physique tourne dans le navigateur. Rapier est déjà
  chargé au démarrage (`homeReady`) ; le monde du décor se construit dès qu'il est
  prêt, puis à chaque changement de plan (`office.buildDecor`).

## Ce qui collisionne

| Modèles                                                                                                                             | Forme                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tous par défaut (meubles, objets de bureau, clavier et ses touches, photocopieuse et sa fente de sortie, ventilateurs et leur tige) | triangles du modèle                                                       |
| Piles de feuilles, boules de papier                                                                                                 | boîtes de `office-props.ts` (beaucoup de petits coins, approximés exprès) |
| Bouches d'aération, porte, feuille isolée au sol                                                                                    | rien : à fleur du mur de la coque, ou à plat                              |
| Murs de la coque (modules du pack)                                                                                                  | boîtes de la coque (`shellSolids`), faces exactes                         |

## Lots

1. **Monde de collision en triangles** (version 407) : monde Rapier du décor,
   requêtes exactes, affichage en mode debug. Les boîtes restent les solides du jeu pendant ce lot.
2. Tirs, visée de pose, caméra, largages : rayons sur les triangles.
3. Avions, marche et véhicules au contact des triangles.
4. Navigation des fourmis et serveur.

## Mode debug

Avec **Debug : ON**, les triangles de collision des objets sont dessinés en fil de
fer jaune (`MESH_COLLIDER_COLOR`), en plus des boîtes cyan
([mode debug](laboratory.md)).

## Mesures

Node 22, Rapier 0.21 (même module que le navigateur), Diagonale :

| Mesure                                | Valeur      |
| ------------------------------------- | ----------- |
| Colliders / triangles                 | 79 / 80 168 |
| Construction du monde Rapier du décor | 150 ms      |
| Rayon à travers toute la pièce        | 16 µs       |

`scripts/test-collision-mesh.mjs` charge le même Rapier que le navigateur et
compare chaque rayon à un test sur tous les triangles (aucun écart), vérifie les points les plus proches, les objets tournés, les
formes approchées et la fente de la photocopieuse, qui reste ouverte.
