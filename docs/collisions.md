# Collisions sur les triangles du décor

Le décor du bureau (objets du Cartoon Office Pack, voir
[plans de bureau](office-layouts.md)) collisionne sur les **vrais triangles** de
ses modèles : à l'échelle d'un moucheron, chaque surface compte (rase-mottes,
atterrissage sur une chaise, pose sur une photocopieuse).

## Monde du décor

`DecorCollision` (`src/office-collision.ts`) crée un monde Rapier par plan, avec
un collider fixe en triangles (`trimesh`) par objet posé, à sa position et sa
rotation ; Rapier garde sa propre structure d'accélération. Le monde est à
l'échelle humaine (`toPhysics`, [physique Rapier](physics-engine.md)) ; les
requêtes prennent et rendent des mètres du jeu :

- `raycast` : impact le plus proche (tout le décor ou un objet), normale tournée
  vers le rayon ;
- `nearest` : point le plus proche ;
- `surface` / `clear` : appui plan et volume libre d'une emprise de pose ;
- `touches`, `supportBelow` et `sweptHitsDecor` : contact, appui sous un point et
  segment balayé ;
- `addTo(world)` : copie les colliders dans un autre monde Rapier
  (`PhysicsWorld.useDecor`).

Le client construit ce monde dès que Rapier est chargé, puis à chaque changement
de plan (`office.buildDecor`, `office.decor`). Le serveur en construit un par plan
et par processus pour les engins sans pilote (`decorFor`, `server/game.js`).
Les boîtes des objets du pack (marquées `decor` par `layoutPieces`) sont ignorées
dès que le monde du décor existe.

| Modèles                                                                                                            | Forme                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Tous par défaut (meubles, objets de bureau, clavier et touches, photocopieuse et sa fente de sortie, ventilateurs) | triangles du modèle                                                       |
| Piles de feuilles, boules de papier                                                                                | boîtes de `office-props.ts` (beaucoup de petits coins, approximés exprès) |
| Bouches d'aération, porte, feuille isolée au sol                                                                   | rien : à fleur du mur de la coque, ou à plat                              |
| Murs de la coque (modules du pack)                                                                                 | boîtes de la coque (`shellSolids`)                                        |

## Ce qui utilise les triangles

- **Rayons du client** : impacts des tirs, exposition aux explosions, recul de la
  caméra, visée de l'hélicoptère. `solidRayDistance` (`src/client.js`) prend
  l'impact le plus proche parmi les boîtes restantes (coque, sol, constructions)
  et les triangles.
- **Projectiles lourds** : obus, roquettes et missiles avancent par sous-pas de
  1/120 s ; `stepHeavy` (`src/heavy-sim.js`) tire un rayon le long de chaque
  sous-pas (`world.decorRay`). Une fusée de proximité armée lit la distance au
  triangle le plus proche (`world.decorNearest`) et explose quand cette distance,
  entrée dans le rayon de proximité, recommence à croître. Ennemis, joueurs,
  véhicules et postes restent des sphères ou des coques.
- **Pose d'équipement** : `supportedPlacement` (`src/equipment.ts`) prend un appui
  `DecorSupport`. Le client cherche une surface plane et horizontale sous le centre
  et les quatre coins de l'emprise (normales au-delà de 0,95, écart de hauteur
  d'au plus 2 mm) et vérifie le volume libre au-dessus ; `aimPlacement` vise une
  face supérieure d'un meuble. Les **appareils** (`rugged`) se contentent d'une
  surface inclinée de 60° au plus sous le centre, coins dans le vide permis : on
  pose un appareil sur un clavier ou les pales d'un ventilateur, mais aucun
  équipement ordinaire sur le clavier. Côté serveur, `decorTrust` accepte la
  hauteur envoyée si elle tombe dans la boîte d'un meuble sous le centre
  ([confiance](trust-model.md)).
- **Vol** : l'avion s'écrase quand son point, gonflé de 0,3 unité d'acteur, touche
  un triangle ou quand le segment parcouru depuis l'image précédente en traverse
  un (`sweptHitsDecor`) ; il se pose (`resolveLanding`, `src/sortie.ts`) sur la
  surface tournée vers le haut sous lui (`supportBelow`).
- **Marche** (`stepWalker`) : appui sur la vraie surface ; les faces proches des
  jambes, de la poitrine et de la tête repoussent le marcheur.
- **Engins Rapier** (avions, hélicoptères, char, camion, Castor) :
  `PhysicsWorld.useDecor` copie les triangles dans le monde de l'engin et en retire
  les boîtes des meubles.

## Restent sur les boîtes

- Calculs du serveur seul : largages (`airdrop.ts`), livraisons (`delivery.ts`),
  apparitions sur les lits (`beds.ts`), constructions du Castor.
- Navigation des insectes au sol (`ground-defense.ts`, `ground-creatures.ts`).
- Effets visuels : débris des crashs (`crash-effects.ts`), suspension des chenilles
  (`track-suspension.ts`).

## Affichage

Le bouton « Volumes » de l'en-tête dessine les triangles de collision en fil de
fer jaune (`MESH_COLLIDER_COLOR`, `src/debug-tools.ts`), en plus des boîtes cyan
([affichage de la physique](physics-debug.md)).

## Vérifier

`scripts/test-collision-mesh.mjs` charge le même Rapier que le navigateur,
compare chaque rayon à un test sur tous les triangles, vérifie points les plus
proches, objets tournés, formes approchées et fente de la photocopieuse ouverte ;
il affiche nombre de triangles et temps (sur Diagonale : 79 objets, 80 168
triangles, construction d'environ 170 ms sous Node, rayon à travers la pièce
d'environ 15 µs). `scripts/test-collision-motion.mjs` couvre atterrissage, crash,
marche et mondes des véhicules. Le ressenti en vol sur les triangles reste à
juger en partie.
