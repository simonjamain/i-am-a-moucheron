# Physique Rapier — essai sur le Castor (version 352)

Le jeu écrit sa physique à la main (vol, hélicoptère, `stepTank`, `stepWalker`,
balistique). Cet essai teste un vrai moteur, **Rapier** (Rust compilé en WebAssembly),
sur un seul véhicule : le Castor. Il est derrière le paramètre d'URL `?rapier` ; sans
lui, le jeu est inchangé et Rapier n'est même pas téléchargé.

## Décision et périmètre

- Choix de Rapier plutôt qu'ammo.js (API lourde, mémoire gérée à la main), cannon-es
  (JavaScript pur, peu actif) ou Jolt (plan B si des chenilles sont voulues). Rapier
  fournit capsules, contrôleur de véhicule à roues, détection continue et un build
  déterministe, et tourne sous Node (tests headless).
- Ce que le moteur ne remplace pas : le vol (aérodynamique maison, réglée), les
  collisions de tirs contre les ennemis (grille spatiale, voir
  [performances](performance.md)) et les ennemis eux-mêmes (leur état vient du serveur).
- Étapes suivantes possibles, si l'essai convainc : capsules pour la marche des pilotes
  et pour les volumes de touche des ennemis, véhicules vides, autres véhicules au sol.

## Unités : la physique travaille à l'échelle humaine

La pièce est modélisée en mètres SI ; les pilotes y mesurent environ 3 cm. Pour que la
physique garde le « poids » d'un humain, elle travaille en **mètres humains** : un pilote
(5,6 unités de modèle) mesure 1,8 m, la gravité vaut 9,81 m/s². Tout passe par
`toPhysics` / `toWorld` (`src/physics-world.js`) :

```
MODEL_UNIT      = 1,8 / 5,6            mètres physiques par unité de modèle
WORLD_PER_METRE = ACTOR_UNIT / MODEL_UNIT   mètres du monde par mètre physique (≈ 0,0173)
```

Rendre les joueurs deux fois plus petits ne change que `ACTOR_UNIT` : la physique, vue en
mètres humains, garde la même sensation. Le rapport de carte `MAP.ratio` ne sert qu'à
l'affichage des distances. Conséquences pour le Castor : sa vitesse maximale (52 m de
référence/s) devient 9 m/s (32 km/h), et sa gravité est la vraie (9,81 m/s² physiques,
soit environ 0,17 m/s² dans le monde) au lieu de 9,81 × `MAP.ratio` (environ 0,03 m/s²)
que les autres véhicules utilisent encore : un Castor qui tombe d'un bureau tombe plus
vite que les autres corps. La mort en cas de chute est conservée comme **hauteur** de chute (environ 6 cm de la
pièce), pas comme vitesse.

## Modules

| Module                            | Rôle                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vendor/rapier.compat.mjs`        | Rapier 0.21.0 (WASM en base64, 4,3 Mo, environ 1,7 Mo compressé), servi sur `/rapier.js`. Provenance et empreinte dans [vendor/README.md](../vendor/README.md). Chargé seulement avec `?rapier`.                                           |
| `src/physics-world.js`            | Unités, `loadRapier`, `PhysicsWorld` : le sol et les boîtes `colliders` du jeu en solides fixes. Boîtes orientées (cadre de lacet) converties en cuboïdes tournés ; la liste est comparée à chaque pas (ajouts et retraits de placements). |
| `src/castor-physics.js`           | `CastorRig` : châssis rigide, six roues à rayon et ressort (positions, rayon tirés du modèle Meshy), conduite, direction, freinage. Même contrat que `stepTank`, appelé par `physics()` dans `client.js`.                                  |
| `scripts/test-castor-physics.mjs` | Test Node (dans `npm test`) : unités, géométrie, conduite, mur, solides orientés contre `rayCollider`, téléportation, chute.                                                                                                               |

## Conduite du Castor sur Rapier

- **Moteur** : poussée sur les six roues, `accel` = 4 m/s² au départ (départ progressif,
  issue #171), qui s'annule en approchant la vitesse maximale. Marche arrière limitée à la
  moitié de la vitesse maximale.
- **Freins** : une commande contraire au mouvement freine à environ 7 m/s², puis passe en
  marche arrière une fois arrêté. Sans commande : frein moteur d'environ 1,2 m/s², et
  maintien à l'arrêt.
- **Direction géométrique** (`wheelSteering`) : l'essieu avant braque, l'essieu central est
  le pivot, l'essieu arrière braque en sens inverse, comme sur un camion à plusieurs
  essieux ; la roue intérieure braque plus (Ackermann). Le volant tourne à 2,4 rad/s au plus
  et se recentre à cette vitesse.
- **Braquage limité par l'adhérence** (`steerLimit`) : pleine butée (0,55 rad) à l'arrêt,
  puis juste ce que les pneus tiennent (accélération latérale ≤ 5,5 m/s²). À pleine vitesse
  le rayon de virage est d'environ 13 m ; à basse vitesse le Castor tourne serré. En marche
  arrière, la rotation s'inverse naturellement comme sur une voiture (ancien
  `reverseSteering`).
- **Collisions** : le châssis rigide s'arrête sur les murs (les anciens `colliders` du jeu),
  sans rebond ni dégâts, et glisse ou s'arrête selon l'angle ; la masse est basse, pas de
  retournement dans les essais de slalom.

## Réglages et étalonnage

Tous les paramètres sont dans `CASTOR_PHYSICS`. Le frein de roue de Rapier n'est pas une
force : mesuré sur ce châssis (400 kg, six roues), une valeur `b` par roue ralentit
d'environ 1,85·b m/s² jusqu'à la limite d'adhérence ; `BRAKE_PER_DECEL` en tient compte et
`test-castor-physics.mjs` vérifie les décélérations obtenues. La raideur des ressorts (100)
donne une assiette de repos à 1,5 % de la hauteur du modèle.

Coût mesuré (Node, 2 boîtes) : environ 0,03 ms par pas de 1/120 s, soit 4 ms par seconde
de jeu.

## Limites et essais à faire en jeu

- Aucun essai de sensation n'a été fait en jeu : à vérifier avec `?rapier` (voir ci-dessous).
  Les valeurs (accélération, freins, braquage, adhérence) sont une première estimation
  réaliste, à régler au ressenti.
- Le châssis peut maintenant tanguer et rouler : le quaternion envoyé aux autres joueurs
  contient donc le roulis et le tangage, qui étaient nuls. Les caméras de conduite suivent
  la souris, pas le châssis.
- Les Castor sans pilote restent simulés par `stepTank` (immobiles, gravité seule) ; le
  corps Rapier suit la pose du jeu à chaque pas et se téléporte si le jeu déplace le
  véhicule (placement, apparition).
- Les roues affichées déduisent leur braquage du taux de lacet (`castor-wheels.ts`) ; le
  braquage réel de la physique n'est pas encore transmis au modèle.
- Le glissement le long d'un mur oblique est faible : les roues gardent le cap.
- Le serveur Node ne compresse pas les ressources : `/rapier.js` est servi en 4,3 Mo (environ 1,7 Mo si le reverse proxy compresse). Seule la page avec `?rapier` le télécharge, une fois (URL immuable versionnée).
- Le gain CPU des tirs ne dépend pas de cet essai ; voir [performances](performance.md).

Essai en jeu : ouvrir la page avec `?rapier` (la console affiche « Castor : physique
Rapier active »), monter dans un Castor, accélérer, braquer à basse puis haute vitesse,
freiner, reculer, heurter un bureau et un mur oblique, tomber d'un bureau. Comparer avec la
page sans `?rapier`. Avec une partie à plusieurs : un autre joueur doit voir le Castor
suivre le même trajet sans saccade.
