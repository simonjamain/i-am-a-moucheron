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
   requêtes exactes, affichage en mode debug.
2. Rayons sur les triangles, en deux temps :
   - **2a (version 408)**, rayons propres au client : impacts des tirs, exposition
     aux explosions, recul de la caméra devant le décor, visée de l'hélicoptère, jet
     d'eau (particules). `solidRayDistance` (`src/client.js`) prend l'impact le
     plus proche parmi les boîtes restantes (coque, sol, constructions) et les
     triangles du décor ; les boîtes des objets du pack (marquées `decor` par
     `layoutPieces`) sont ignorées dès que le monde du décor existe ;
   - **Projectiles lourds (version 411)** : obus, roquettes et missiles sont un point
     qui avance par sous-pas de 1/120 s ; `stepHeavy` (`src/heavy-sim.js`) tire un rayon
     le long de chaque sous-pas sur les triangles (`world.decorRay`, fourni par
     `client.js` : `DecorCollision.raycast`), comme une balle. Leurs boîtes `decor`
     sont écartées dès que le monde du décor existe. Les fusées de proximité
     (version 412) suivent la même règle : contact par rayon (inerte avant armement), et
     une fois armées, `world.decorNearest` (`DecorCollision.nearest`) donne la distance
     au triangle le plus proche ; elles explosent quand cette distance, entrée dans le
     rayon de proximité, recommence à croître (ou sort du rayon), donc en s'éloignant.
     Les ennemis, joueurs, véhicules et postes restent des sphères/coques. Le serveur ne simule
     pas ces tirs : `MAX_ORDNANCE` (10 000) ne protège que la salle ;
   - **2b (version 409)**, pose d'équipement par le joueur sur les vraies surfaces.
     `supportedPlacement` (`src/equipment.ts`) prend un appui `DecorSupport` :
     côté client, le monde du décor cherche une surface plane et horizontale sous
     le centre et les quatre coins de l'emprise (rayons verticaux, normales à plus
     de 0,95, écart de hauteur d'au plus 2 mm) et vérifie le volume libre au-dessus
     (`intersectionsWithShape` de Rapier) ; la visée (`aimPlacement`, client) vise
     une face supérieure d'un meuble ou s'arrête sur ses autres faces. Côté
     serveur, `decorTrust` accepte la hauteur envoyée par le client si elle tombe
     dans la boîte d'un meuble sous le centre (confiance aux clients) ; les boîtes
     des meubles ne portent ni ne bloquent plus la pose. Sol, coque, constructions
     et équipements voisins gardent leurs règles. On pose ainsi sur l'assise d'une
     chaise ou le dessus de la photocopieuse ; le clavier, aux touches inégales, ne
     porte rien. Les largages, livraisons, apparitions sur les lits et constructions
     du Castor sont calculés par le serveur seul : ils restent sur les boîtes
     jusqu'au lot 4.
3. **Avions, marche et véhicules au contact des triangles (version 410)** :
   - **vol** (`client.js`) : l'avion s'écrase quand son point, gonflé de 0,3 unité
     d'acteur, touche un triangle, ou quand le segment parcouru depuis l'image
     précédente en traverse un (`sweptHitsDecor`) : pas de passage à travers une
     pale, une feuille ou un panneau ; atterrissage (`resolveLanding`, `sortie.ts`)
     sur la surface tournée vers le haut sous l'avion (`supportBelow`), dans la
     même fenêtre que sur les boîtes ; les appareils sans pilote
     (`stepVacantAircraft`) suivent les mêmes règles ;
   - **marche** (`stepWalker`) : appui sur la vraie surface sous le marcheur ; les
     faces proches des jambes, de la poitrine et de la tête le repoussent ;
   - **véhicules Rapier** (char, camion, Castor) : `PhysicsWorld.useDecor` copie les
     colliders en triangles du décor dans le monde de l'engin (une fois, 63 ms sous
     Node pour Diagonale) et en retire les boîtes des meubles ;
   - restent sur les boîtes : débris des crashs (`crash-effects.ts`) et
     suspension visuelle des chenilles (`track-suspension.ts`), purement visuels.
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
