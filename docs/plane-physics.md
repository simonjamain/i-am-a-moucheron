# Vol des avions sur Rapier

Les avions à voilure fixe (`PLANE_TYPES` : biplan `fighter`, bombardier biplan
`bomber`, `lightfighter`, `medbomber`, `interceptor`, `spitfire`) sont des corps
rigides Rapier pilotés par des forces (`src/plane-physics.ts`, classe `PlaneRig`).
Unités, chargement et engins sans pilote : [physique Rapier](physics-engine.md) ;
hélicoptères : [vol des hélicoptères](heli-physics.md).

## Un modèle par avion

`scripts/measure-aircraft.mjs` mesure chaque modèle et écrit
`src/aircraft-geometry.ts` (unités de modèle) : moyeux des roues, point d'appui de
la queue, boîtes autour des îlots du maillage (fuselage, ailes, empennage,
dérive), centre de masse. Le biplan garde ses valeurs réglées à la main et
validées en vol ; pour les autres, une boîte est relevée au-dessus de la droite
roues–queue (sinon elle porterait l'avion à la place du train). `planeSpec(type)`
en tire :

- le train : course des roues principales ≈ 0,6 de la hauteur au sol, roulette ou
  béquille à demi-course ; centre de masse derrière les roues (20 % du poids sur
  la queue) ;
- les paramètres de vol : décrochage à 0,32 de la vitesse maximale du type,
  `thrustLimit` à 1,33 fois celle-ci, poussée selon `VEHICLES[type].thrust`, masse
  selon l'envergure.

Les roues principales sont des pièces du modèle (`wheelL` / `wheelR`, moyeux
compris, `scripts/rig-biplane-wheels.mjs`, `scripts/rig-aircraft-wheels.mjs`), fixes en
direction : `poseWheels` (`src/aircraft-wheels.ts`) les monte selon la compression des
ressorts et les fait tourner avec la vitesse au sol ; les avions des autres
joueurs montrent les ressorts affaissés au sol et détendus en vol
(`parkedCompression`).

## Modèle de vol

Rapier n'a pas de modèle de vol : il intègre les forces que calcule le jeu. Le
modèle suit les jeux de vol arcade
[vazgriz/FlightSim](https://github.com/vazgriz/FlightSim) (portance et traînée
induite selon l'angle d'attaque, direction par vitesse angulaire visée) et
[brihernandez/MouseFlight](https://github.com/brihernandez/MouseFlight) (visée à
la souris par « instructeur », `src/mouse-flight.ts`).

- **Échelle.** Les formules sont écrites en mètres de référence (le biplan décroche
  à 17 m/s et plafonne vers 52 m/s) puis converties par `K` (mètres physiques par
  mètre de référence) : longueurs, vitesses et accélérations suivent `K`, le temps
  non ; la gravité de l'avion vaut `9,81 × K`. `MODEL_TO_REF` convertit les unités
  de modèle.
- **Portance** `CL(α)` : linéaire jusqu'à l'angle de décrochage (`stallAngle`,
  0,3 rad), puis chute vers une courbe de plaque ; une incidence fixe (`zeroLift`)
  évite de tenir le manche en croisière.
- **Protection d'incidence.** Avec de la vitesse (au-delà de 1,2 à 1,8 fois le
  décrochage), la commande de cabrage s'éteint à l'approche du décrochage : tirer à
  fond donne le meilleur virage, pas un nez qui court devant la trajectoire. Sans
  vitesse, la protection disparaît et le décrochage reste possible.
- **Traînée** `CD0 + k CL²`, plus un terme en `sin² α` une fois décroché ;
  **poussée** le long du nez, décroissante avec la vitesse.
- **Stabilité** : l'air ramène le nez vers la trajectoire et fait piquer au
  décrochage.
- **Gouvernes** : l'instructeur (ou les touches) fixe des vitesses angulaires
  visées, multipliées par une autorité par axe (`controlAuthority`), quadratique
  avec l'air sur les surfaces. Le souffle de l'hélice (`PROPWASH`, 14 m/s à pleins
  gaz) garde un peu d'effet à la profondeur et à la direction ; les ailerons ne
  sentent que la vitesse. Sur ses roues, tangage et roulis ne comptent qu'au-delà
  de la moitié de la vitesse de décrochage.
- **Train** : trois ressorts à rayon (deux roues, béquille) avec amortisseur,
  adhérence latérale, roulement et freinage quand les gaz sont à zéro ; la béquille
  a peu d'adhérence latérale, on s'oriente en avançant avec un filet de gaz.
  L'avion suit la pente d'un sol irrégulier (`castRayAndGetNormal` sur le décor et
  les solides).
- **Cellule** : un collider par boîte mesurée, CCD activé. Les impulsions de
  contact donnent `state.impact` (variation de vitesse en m/s de référence) :
  au-delà de 2,5 l'avion prend des dégâts, au-delà de `PLANE_CRASH_IMPACT` (16) il
  est détruit. C'est la seule source de dégâts de collision de l'avion : ni vitesse
  d'approche comparée, ni repoussée après un choc.
- **Murs** : quatre murs invisibles (`PhysicsWorld.addRoomWalls`, faces intérieures
  aux murs de `LAYOUT_ROOM`, jusqu'au plancher du ciel) ferment la pièce, côté ouvert
  compris : un choc contre un mur est un contact comme un autre.

## Intégration

Pour un type de `PLANE_TYPES`, `client.js` remplace le pas de vol, la pose au sol
et les tests de boîtes par `planeRig.step` (un rig par type piloté) ;
l'instructeur reçoit les vitesses angulaires dans le repère de l'avion. Le décor
est copié dans le monde de l'avion (`useDecor`). Le décrochage se voit et
s'entend : [rubans d'air](air-ribbons.md).

## Vérifier

`scripts/test-plane-physics.mjs` : courbe de portance, croisière en palier,
décollage, décrochage, atterrissage sur une pente de 7°, piqué contre le sol,
visée à la souris (virages jusqu'à 170°) sans décrocher.
`scripts/test-aircraft-wheels.mjs` : roues et compression.

Essai en jeu (ressenti non vérifié automatiquement) : décoller (gaz à fond, tirer
vers 24 m/s), tenir la visée souris, virer serré, ralentir jusqu'au décrochage,
se poser sur un bureau incliné ou un livre, toucher un meuble (dégâts) et la
pièce.
