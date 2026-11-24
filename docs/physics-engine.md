# Physique Rapier

Tous les engins roulent ou volent sur **Rapier** (Rust compilé en WebAssembly) :
véhicules au sol (ici), [avions](plane-physics.md) et
[hélicoptères](heli-physics.md). Le décor du bureau y collisionne sur ses
triangles ([collisions](collisions.md)). La marche passe par le contrôleur de personnage
de Rapier (`WalkerWorld`, `stepWalker` dans `src/sortie.ts`) ; la poussée entre
marcheurs, l'intégration plane et les règles des mondes restent dans
`walk-arena.ts`. Tous les rayons, segments et distances contre les solides (tirs,
obus lourds, caméra, visée de pose, atterrissage, débris, chenilles) passent par
`SolidQuery` ; la balistique garde son calcul des trajectoires et des cibles
(ennemis, joueurs, véhicules). `helicopter.ts` ne fait voler un hélicoptère que tant que Rapier n'est pas chargé. Le bouton
« Physique » dessine corps, ressorts et forces : [affichage de la
physique](physics-debug.md).

Rapier a été préféré à ammo.js (API lourde, mémoire gérée à la main), cannon-es
(JavaScript pur, peu actif) et Jolt : il fournit contrôleur de véhicule à roues,
détection continue et build déterministe, et tourne sous Node (tests et engins
sans pilote). Il ne remplace ni l'aérodynamique (forces écrites par le jeu), ni
les touches des tirs sur les ennemis ([performances](performance.md)), ni les
ennemis eux-mêmes.

## Chargement

`vendor/rapier.compat.mjs` (Rapier 0.21.0, WASM en base64, 4,3 Mo, environ
1,7 Mo compressé ; provenance dans [vendor/README.md](../vendor/README.md)) est
servi sur `/rapier.js` et chargé par `loadRapier` pendant l'écran de chargement
(`homeReady` l'attend) ; un échec est une erreur de démarrage. Le serveur Node ne
compresse pas les ressources : sur une connexion lente, ces 4,3 Mo allongent le
premier chargement (URL versionnée, téléchargée une fois). Le serveur charge
`@dimforge/rapier3d-compat` à la première sortie d'un pilote.

## Unités : l'échelle humaine

La pièce est en mètres SI et un pilote y mesure environ 3 cm. La physique
travaille en **mètres humains** : un pilote (5,6 unités de modèle) mesure 1,8 m
et la gravité vaut 9,81 m/s². Tout passe par `toPhysics` / `toWorld`
(`src/physics-world.ts`) :

```
MODEL_UNIT      = 1,8 / 5,6                 mètres physiques par unité de modèle
WORLD_PER_METRE = ACTOR_UNIT / MODEL_UNIT   mètres du monde par mètre physique (≈ 0,0173)
```

Rendre les joueurs plus petits ne change que `ACTOR_UNIT`. Les profils de
`fleet.ts` sont en « mètres de référence » (`maxSpeed` du Castor : 52, soit
9 m/s physiques). Une chute est mortelle au-delà d'une **hauteur** (environ 6 cm
de la pièce, `FALL_KILL_SPEED`), indépendante de la gravité.

## Modules

| Module                  | Rôle                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/physics-world.ts`  | Unités, `loadRapier`, `PhysicsWorld` : sol et boîtes `colliders` du jeu en solides fixes (boîtes orientées en cuboïdes tournés, liste comparée à chaque pas) ; `useDecor` y copie les triangles du décor. |
| `src/castor-physics.ts` | `CastorRig` : châssis, six roues à rayon et ressort (positions et rayon tirés du modèle), conduite. Réglages : `CASTOR_PHYSICS`.                                                                          |
| `src/tank-physics.ts`   | `TankRig` : coque sur douze ressorts (un par galet), chenilles. Réglages : `TANK_PHYSICS`.                                                                                                                |
| `src/truck-physics.ts`  | `TruckRig` : tracteur 6x4 et remorque sur une rotule, roues à ressort. Réglages : `TRUCK_PHYSICS`.                                                                                                        |
| `src/parked-host.ts`    | `ParkedHost` : monde du serveur pour les engins sans pilote.                                                                                                                                              |

Chaque rig lit et écrit le contrat d'état commun (`p`, `q`, `v`, `omega`) ;
`physics()` dans `client.js` le fait avancer pour l'engin piloté. Le quaternion
envoyé aux autres contient roulis et tangage ; les caméras de conduite suivent la
souris, pas le châssis.

## Castor

- **Moteur** : poussée sur les six roues, `accel` 2,5 m/s² au départ, qui
  s'annule en approchant de la vitesse maximale (marge `topMargin`). Marche
  arrière à la moitié de la vitesse maximale.
- **Freins** : une commande contraire freine à 7 m/s² puis passe en marche
  arrière une fois arrêté ; sans commande, frein moteur de 1,2 m/s² et maintien
  à l'arrêt. Le frein de roue de Rapier est une impulsion, pas une force : sur ce
  châssis (400 kg), une valeur `b` par roue ralentit d'environ 1,85·b m/s² ;
  `BRAKE_PER_DECEL` en tient compte.
- **Direction** (`wheelSteering`, Ackermann) : l'essieu avant braque, l'essieu
  central est le pivot, l'arrière braque en sens inverse ; la roue intérieure
  braque plus. Volant à 2,4 rad/s au plus.
- **Braquage limité par l'adhérence** (`steerLimit`) : 0,55 rad à l'arrêt, puis ce
  que tiennent les pneus (5,5 m/s² latéraux) : rayon d'environ 13 m à pleine
  vitesse.
- **Collisions** : le châssis s'arrête sur les murs sans rebond ni dégâts et glisse
  ou s'arrête selon l'angle ; masse basse, pas de retournement. Les ressorts
  (raideur 100) donnent une assiette de repos à 1,5 % de la hauteur du modèle.
- Les roues affichées déduisent leur braquage du taux de lacet
  (`castor-wheels.ts`) : le braquage de la physique n'est pas transmis.

## Char moyen

- **Échelle** : char moyen réduit, dessiné à `VEHICLE_SCALE.tank` = 1,2
  (`fleet.ts`, `vehicleUnit(type)`). Par similitude de Froude, masses en taille³,
  vitesses en √taille et taux de rotation en 1/√taille : profil `maxSpeed` 32,
  `turn` 1,2. Les longueurs du rig suivent `TANK_SCALE`.
- **Suspension** : douze ressorts à rayon ; affaissement de 4 cm au repos,
  amortissement à 45 %. Le char pique au freinage, se cabre en accélérant et
  penche en virage. `rig.wheelCompression` expose chaque ressort.
- **Chenilles** : Z/S poussent ou tirent les deux chenilles ; Q/D ajoutent une
  différence de poussée à toute vitesse (asservissement du taux de lacet) ; Q ou D
  seul fait pivoter sur place. La poussée commune est limitée par l'adhérence
  (charge × 0,9, une pente de 42°) ; le glissement latéral est un frottement sec
  plus faible (0,4).
- **Accélération** : 1,2 m/s² au départ. Tant qu'une touche est appuyée, la pente
  est compensée (`slopeAssist`) : le char franchit une marche de 18 cm et bute sur
  40 cm (nez et arrière chanfreinés).
- **Frein de parking** : sans touche, au sol et sous 0,12 m/s, le char est
  immobilisé et publie une vitesse nulle.
- **Recul** : chaque obus déclenche `src/tank-recoil.ts` (le tube `cannonBarrel`
  recule de 0,32 unité en 0,05 s et revient en 0,55 s) et, sur la machine qui
  simule la caisse (conducteur, ou serveur si le char est vide), `TankRig.kick` :
  une impulsion de 0,35 m/s au pivot du canon.
- **Canon** : l'axe d'élévation est à la base du tube, à l'avant de la tourelle
  (`cannonGun` porte masque et mitrailleuse coaxiale, `cannonBarrel` le tube) ;
  `tankBarrelOrigin` en tient compte. Élévation de 30° au plus
  (`TANK_GUN_MAX_PITCH`, `src/armament.ts`), butée côté client seulement.
- **Vue du tireur** (`tankSight`, `SIGHT` dans `tank-view.js`) : l'œil est derrière
  (0,4) et au-dessus (0,75) du pivot, dans le repère du canon : il monte avec le
  tube et reste au-dessus du toit à toute élévation, sans suivre le recul.
- **Chenilles déformables (cosmétiques)** : un char distant n'a pas de ressorts ;
  `src/track-suspension.ts` reconstruit le relief sous chaque essieu depuis la
  pose et les colliders, pour le char local comme pour les distants. Chaque
  chenille est découpée par `src/tessellate.ts` (arêtes ≤ 0,3 unité) ;
  `updateSuspension` fait suivre le relief aux galets, barbotins et tendeurs
  (débattement ±0,18 unité, lissage 14/s) et déforme le brin bas
  (`beltDisplacement`). `src/tank-gear.ts` partage les essieux avec la physique.

## Camion DCA

- **Deux corps** : tracteur (130 kg) et remorque du canon (45 kg), liés par une
  **rotule** à butées souples : lacet jusqu'à 100°, tangage ±26°, roulis ±17°.
  L'état réseau porte `trailerAngle` et `trailerPitch` (bornés par
  `TRAILER_LIMITS`), pas le roulis.
- **Vitesse** : 11,4 m/s (`maxSpeed` 66, double d'un vrai camion pour le jeu),
  1,2 m/s² au départ, environ 25 s pour l'atteindre.
- **Conduite** : comme le Castor (Ackermann, braquage limité à 2,8 m/s² latéraux,
  freins, marche arrière lente) ; seul l'essieu avant braque, le tandem arrière
  et la remorque sont fixes. L'angle demandé (`steer`, volant à 1,8 rad/s, butée
  0,5 rad) voyage dans l'état : les autres joueurs voient les roues braquées,
  même à l'arrêt (`animateDrivenWheels`, `castor-wheels.ts`).
- **Remorque** : frein d'inertie qui suit celui du camion ; elle se balance à
  l'opposé du virage, pique et se cabre par rapport au tracteur, se recentre sans
  osciller et se met en portefeuille en marche arrière à pleine butée. Un ressort
  de rappel de lacet (`hitchSpring`, 300 N·m/rad) compense l'instabilité en
  marche arrière sans l'empêcher de plier.
- **Ressorts** plus souples (60) que ceux du Castor : un tracteur léger sur des
  ressorts raides rebondit et roule.

## Roues et chenilles dans les modèles

Les modèles Meshy du camion et du char sont un maillage texturé dont les pièces
sont des îlots de triangles. `scripts/split-vehicle-parts.mjs` en extrait des
pièces du rig sans toucher un triangle, une UV ni la texture (il refuse un module
déjà découpé et inscrit sa trace dans l'en-tête du module de données) :

- camion : six roues de tracteur (`wheel0…5`) et quatre de remorque
  (`trailerWheel0…3`, dans le repère de la remorque, origine à l'attelage), pivot
  au centre ; la physique lit leurs pivots et rayons ;
- char : deux chenilles (`trackL`, `trackR`), huit galets (`roadWheel0…7`), deux
  barbotins (`idler0/1`) et deux pignons (`sprocket0/1`), de l'avant vers
  l'arrière, gauche puis droite. `animateTrackedWheels` les fait tourner à la
  vitesse de leur chenille. `scripts/rig-tank-hubs.mjs` place les capuchons des
  moyeux dans la pièce de leur roue ; `scripts/rig-tank-gun.mjs` sépare masque et
  tube.

## Engins sans pilote : le serveur

Quand le pilote d'un avion, d'un hélicoptère, d'un char, d'un camion ou d'un
Castor en sort, le serveur marque l'engin `hosted` (`vehicle-exit`,
`server/game.js`) et le simule avec le même rig que le client, moteur coupé et
freins serrés. Aucun client ne simule d'engin vide.

- Un `ParkedHost` par salle : un seul monde Rapier (gravité 9,81 ; les avions ont
  la leur par `setGravityScale`), le décor du plan copié une fois (construit une fois
  par processus, environ 150 ms), tous les engins garés dedans ; les rigs
  demandent leur pas et l'hôte le fait une fois (`PhysicsWorld.deferred` /
  `flush`). Rien n'est simulé pour un engin jamais utilisé.
- **Sommeil** : un avion est endormi par Rapier ; un engin terrestre après une
  seconde de repos, réveillé si quelque chose le heurte. Au repos, il rapporte `v`
  et `omega` nuls (sinon le résidu du solveur ferait monter l'engin chez les
  clients). Un dormeur ne coûte rien et n'envoie plus de mises à jour. Dès qu'un
  pilote s'assoit, l'engin quitte ce monde et le client reprend l'autorité.
- Un engin ajouté à un monde déjà actif attend un pas de monde avant sa première
  suspension (`CastorRig`, `TruckRig`), sinon Rapier désactive son corps.
- **Pont de départ** : engins de départ et achetés naissent dans ce monde
  (`hosted` dès `createVehicle`), se posent et s'endorment. Pendant 5 s après sa
  naissance, un engin ne peut pas être « parti du pont » ; il ne l'est qu'après
  1,5 s continues en l'air ; un remplaçant naît décalé si un engin du même type
  occupe le pont, et pas moins de 10 s après le précédent s'il n'a jamais été
  piloté (`Game.fleet`, `advanceParked`).
- Le recul d'un char garé qui tire est appliqué par `ParkedHost.kick`.
- Un choc au-delà du seuil de l'engin, une chute mortelle ou une sortie de la
  pièce le détruit (`hp = 0`). Les constructions des joueurs ne sont pas dans ce
  monde (seulement la pièce et le décor).

## Vérifier

`scripts/test-castor-physics.mjs`, `test-tank-physics.mjs`,
`test-truck-physics.mjs` (unités, géométrie mesurée sur le maillage, conduite,
pivot, attelage, murs, marches, chutes), `test-track-suspension.mjs`,
`test-tank-recoil.mjs` (rayons de l'œil vers le tube à six élévations),
`test-tank-wheels.mjs`, `test-truck-wheels.mjs`, `test-castor-wheels.mjs`,
`test-parked-host.mjs`, `test-start-pad.mjs`, `test-aircraft-wheels.mjs`. Coût
mesuré sous Node : environ 0,03 ms par pas de 1/120 s pour un Castor.

Les réglages restent à valider au ressenti, à plusieurs et en réseau dégradé.
Essai en jeu : accélérer, braquer à basse puis haute vitesse, freiner, reculer,
heurter un bureau et un mur oblique (le glissement le long d'un mur oblique est
faible), tomber d'un bureau ; un autre joueur doit voir l'engin suivre le même
trajet sans saccade.
