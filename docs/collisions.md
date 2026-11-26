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

- **Requêtes sur les solides** : `SolidQuery` (`src/solid-query.ts`) est le point d'entrée
  unique des rayons, segments et distances au plus proche. Il interroge dans un monde
  Rapier les boîtes (coque, sol, constructions, purgatoire) et, une fois le monde du
  décor construit, les triangles des meubles (leurs boîtes sont alors ignorées). Le client
  le resynchronise une fois par image et quand la liste change de taille ; `hit` (rayon),
  `segment` (pas d'un projectile), `nearest` (distance au plus proche) et `surfaceBelow`
  (dessus de ce qui se trouve sous un point) en sont les réponses, comparées à l'ancien
  test boîte par boîte dans `scripts/test-solid-query.mjs`. Un rayon coûte environ 5 µs :
  l'intérêt est de n'avoir qu'un seul moteur, non un gain de vitesse.
- **Rayons du client** : impacts des tirs, exposition aux explosions, recul de la caméra,
  visée de l'hélicoptère, visée de la pose (`placementAim`).
- **Projectiles lourds** : obus, roquettes et missiles avancent par sous-pas de 1/120 s ;
  `stepHeavy` (`src/heavy-sim.ts`) demande au monde le premier solide rencontré sur chaque
  sous-pas (`world.solidSegment`, normale comprise pour le ricochet). Une fusée de
  proximité armée lit la distance au solide le plus proche (`world.solidNearest`) et explose
  quand cette distance, entrée dans le rayon de proximité, recommence à croître ; le point
  d'explosion est alors le passage le plus proche de la course (recherche par
  échantillonnage). L'obstruction d'un souffle est le même segment. Ennemis, joueurs,
  véhicules et postes restent des sphères ou des coques.
- **Pose d'équipement** : `supportedPlacement` (`src/equipment.ts`) interroge `SolidQuery`.
  `supports` cherche, par rayons vers le bas, une surface plane et horizontale sous le
  centre et les quatre coins de l'emprise (normales au-delà de 0,95, écart de hauteur
  d'au plus 2 mm), boîtes puis triangles du décor, la plus haute d'abord ; `clear`
  vérifie le volume libre au-dessus (une boîte Rapier de l'emprise) ; `aimPlacement` vise
  une face supérieure d'un meuble. Sur les triangles du décor, les **appareils** (`rugged`)
  se contentent d'une surface inclinée de 60° au plus sous le centre, coins dans le vide permis : on
  pose un appareil sur un clavier ou les pales d'un ventilateur, mais aucun
  équipement ordinaire sur le clavier. Le serveur ne juge pas la pose d'un joueur
  ([confiance](trust-model.md)) ; il utilise le même test, dans son propre `SolidQuery`
  par plan, pour les largages du Castor volant (`airdropSurface`) et l'atterrissage des
  colis (`deliveryLanding`).
- **Débris et chenilles** : les débris d'un avion écrasé (`CrashEffects`) et la suspension
  cosmétique des chenilles (`updateSuspension`) lisent `SolidQuery`. Les pas de vol de secours
  d'avant le chargement de Rapier (`stepFlight` avec `resolveLanding`, `stepHelicopter`)
  aussi ; en jeu, avions et hélicoptères volent dans leur monde Rapier (dernier point).
- **Marche** (`stepWalker`) : le **contrôleur de personnage de Rapier** déplace une
  capsule dans `WalkerWorld` (`src/walker-world.ts` : sol, boîtes de la coque et des
  constructions, triangles du décor). Il glisse le long des murs, monte les marches
  de 0,15 unité d'acteur et reste collé au sol en descendant ; il garde un mince jeu
  de contact (0,005 unité d'acteur) devant un mur. Gravité, saut et parachute restent
  les règles de `field-physics.ts`.
- **Engins Rapier** (avions, hélicoptères, char, camion, Castor) :
  `PhysicsWorld.useDecor` copie les triangles dans le monde de l'engin et en retire
  les boîtes des meubles.

## Restent sur les boîtes

- Routes des insectes et navigation au sol (`route-navigation.ts`, `ground-defense.ts`,
  `ground-creatures.ts`) : [insectes et Rapier](insects-rapier.md).

## Affichage

Le bouton « Volumes » de l'en-tête dessine les triangles de collision en fil de
fer jaune (`MESH_COLLIDER_COLOR`, `src/debug-tools.ts`), en plus des boîtes cyan
([affichage de la physique](physics-debug.md)).

## Vérifier

`scripts/test-collision-mesh.mjs` charge le même Rapier que le navigateur,
compare chaque rayon à un test sur tous les triangles, vérifie points les plus
proches, objets tournés, formes approchées et fente de la photocopieuse ouverte ;
il affiche nombre de triangles et temps (sur Diagonale : 79 objets, 80 168
triangles, construction d'environ 180 ms sous Node, rayon à travers la pièce
d'environ 16 µs). `scripts/test-collision-motion.mjs` couvre atterrissage, crash,
marche et mondes des véhicules. Le ressenti en vol sur les triangles reste à
juger en partie.
