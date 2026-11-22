# Vol des avions sur Rapier

Les avions à voilure fixe (biplan, bombardier biplan, chasseur léger, bombardier moyen,
intercepteur, Spitfire : `PLANE_TYPES`) sont des corps rigides Rapier (`src/plane-physics.ts`,
classe `PlaneRig`), pilotés par des forces. Les hélicoptères ont le même schéma :
[heli-physics.md](heli-physics.md).

## Un modèle par avion

La géométrie de chaque avion est mesurée sur son modèle (`scripts/measure-aircraft.mjs` écrit
`src/aircraft-geometry.ts` : moyeux des roues, point d'appui de la queue, boîtes autour des
îlots du maillage, en unités de modèle). Le biplan garde ses valeurs réglées à la main (validées
en vol) ; pour les autres, une boîte est relevée au-dessus de la droite roues–queue (sinon
elle porterait l'avion à la place du train). `planeSpec(type)` en tire le train (course des
roues principales ≈ 0,6 de la hauteur au sol, roulette à demi-course), le centre de masse
(derrière les roues : un cinquième du poids sur la queue) et les paramètres de vol
(décrochage à 0,32 de la vitesse maximale du type, `thrustLimit` à 1,33, poussée selon
`VEHICLES[type].thrust`, masse selon l'envergure). Les roues principales de chaque modèle sont
des pièces du modèle (`scripts/rig-biplane-wheels.mjs`, `scripts/rig-aircraft-wheels.mjs` :
`wheelL` / `wheelR`, moyeux compris).

## Méthode

Aucun modèle de vol de Rapier : il intègre les forces. Le modèle suit les jeux de vol
arcade connus : [vazgriz/FlightSim](https://github.com/vazgriz/FlightSim) (portance et traînée
induite selon l'angle d'attaque, direction par vitesse angulaire visée) et
[brihernandez/MouseFlight](https://github.com/brihernandez/MouseFlight) (visée à la souris
par « instructeur », comme War Thunder ; déjà dans `src/mouse-flight.ts`).

- **Échelle.** Les formules sont écrites en « mètres de référence » (un biplan décroche à
  17 m/s et plafonne vers 52 m/s, quel que soit le rapport de miniature) puis converties
  (`K` = mètres physiques par mètre de référence) : longueurs, vitesses et accélérations
  suivent `K`, le temps non. La gravité du monde du biplan vaut `9,81 × K`.
- **Portance** `CL(α)` : linéaire jusqu'à l'angle de décrochage (0,3 rad), puis chute à une
  courbe de plaque ; une incidence fixe (`zeroLift`) évite d'avoir à tenir le manche en
  croisière. Accélération de portance = `g (v/Vdécrochage)² CL / CLmax`.
- **Protection d'incidence.** Avec de la vitesse (au-delà de 1,2 à 1,8 fois le décrochage), la
  commande de cabrage s'éteint à l'approche de l'angle de décrochage : tirer à fond donne le
  meilleur virage des ailes, pas un taux de rotation que la portance ne suit pas (le nez
  courait devant la trajectoire et l'avion décrochait à pleine vitesse). Faute de vitesse la
  protection disparaît : le décrochage reste possible.
- **Traînée** : `CD0 + k CL²`, plus un terme en `sin² α` une fois décroché.
- **Poussée** le long du nez, qui diminue avec la vitesse (hélice).
- **Stabilité** : l'air ramène le nez dans le sens de la trajectoire (tangage, lacet) et
  fait piquer du nez au décrochage.
- **Gouvernes** : l'instructeur (ou les touches) donne tangage, roulis et lacet ; ils
  fixent des vitesses angulaires visées (mêmes valeurs que l'ancien pas) multipliées par
  une autorité **par axe** (`controlAuthority`), quadratique avec l'air sur les surfaces :
  sans vitesse, aucune autorité. L'hélice souffle sur l'empennage (`PROPWASH`, 14 m/s à
  pleins gaz) : profondeur et direction gardent un peu d'effet avec de la puissance, les
  ailerons ne sentent que la vitesse de l'avion. Moteur coupé à l'arrêt, le manche ne fait
  rien. Sur ses roues, tangage et roulis ne comptent qu'à partir de la moitié de la vitesse
  de décrochage (sinon ils écraseraient les ressorts du train). Un décrochage vient donc
  de la vitesse perdue.
- **Train** : trois ressorts à rayon (deux roues et la béquille), comme la suspension du
  char : ressort + amortisseur, adhérence latérale, frottement au roulement, freinage
  quand la manette de gaz est à zéro. La béquille est presque omnidirectionnelle (peu
  d'adhérence latérale) : on s'oriente en avançant un peu, avec un filet de gaz sur la
  direction ; il n'y a plus de rotation forcée à l'arrêt. L'avion suit donc la pente d'un sol irrégulier
  (`castRayAndGetNormal` sur le décor et les solides).
- **Alignement sur le modèle** : la géométrie vient du modèle (`src/meshy-biplane-data.js`,
  unités de modèle × `MODEL_TO_REF` = 1,857 m de référence) : moyeux des roues (x ±0,775,
  z −1,546), boîtes des ailes, du fuselage, du plan fixe et de la dérive mesurées sur les
  îlots du maillage, béquille au bas de la gouverne de direction (le modèle n'a pas de
  roulette). Le centre de masse est derrière les roues principales (queue à 20 % du poids).
  Les roues principales sont des **pièces du modèle** (`scripts/rig-biplane-wheels.mjs`,
  nœuds `wheelL` / `wheelR`) : le client les monte de la compression des ressorts
  (`poseBiplaneWheels`) et les fait tourner avec la vitesse au sol ; les avions des autres
  joueurs montrent les ressorts affaissés (`GEAR_SAG`) au sol et détendus en vol. La course
  de la béquille est la moitié de celle des roues principales.
- **Cellule** : cinq colliders (fuselage, deux ailes, empennage, dérive), CCD activé. Les
  impulsions de contact donnent `state.impact` (variation de vitesse en m/s de référence) :
  au-delà de 2,5 l'avion prend des dégâts, au-delà de `PLANE_CRASH_IMPACT` (16) il est
  détruit. Murs et plafond de la pièce gardent la règle à vitesse du client.

## Véhicule garé : le serveur (`src/parked-host.ts`)

Quand le pilote d'un avion, d'un char, d'un camion antiaérien ou d'un Castor en sort (à l'arrêt
ou en parachute), le serveur marque le véhicule `hosted` (`vehicle-exit`, `server/game.js`) et le
simule **lui-même** avec le même rig que le client : moteur coupé, freins serrés (avion : courbe de
friction raide, pas de reptation sur une pente ; char, camion, Castor : frein de parking de
leur rig). Rapier tourne dans Node (`@dimforge/rapier3d-compat`, dépendance de production ;
chargé à la première sortie, le décor d'un plan est construit une fois par processus, environ
150 ms).

- Un `ParkedHost` par room : **un seul monde Rapier** (gravité de 9,81, les avions ont leur propre
  gravité par `gravityScale`), le décor copié une fois, tous les véhicules garés dedans ; les
  rigs demandent leur pas et l'hôte le fait une fois (`PhysicsWorld.deferred` / `flush`). Rien
  n'est simulé pour un véhicule jamais utilisé.
- **Sommeil** : pour un avion, laissé à Rapier (aucune force appliquée à un dormeur) ; pour un
  véhicule terrestre, mis en sommeil après une seconde de repos, puis réveillé tout seul si
  quelque chose le heurte. Un dormeur ne coûte rien et n'envoie plus de mises à jour. Dès
  qu'un pilote s'assoit, le véhicule quitte le monde du serveur et le client reprend l'autorité.
- **Repos = vitesse nulle** : un véhicule terrestre au repos (même critère que le sommeil) rapporte
  `v` et `omega` nuls, et ses corps sont remis à zéro avant de dormir. Le solveur laisse sinon un
  résidu (≈ 0,6 m/s vers le haut) que les clients prolongent : l'engin acheté montait alors
  lentement dans l'affichage. Test : `test-parked-host.mjs` (4b).
- **Véhicules de départ et achetés** : ils naissent déjà dans ce monde (`hosted` dès `createVehicle`),
  se posent sur le pont puis s'endorment seuls. Anti-boucle de réapparition (`Game.fleet`,
  `advanceParked`) : pendant 5 s après sa naissance un engin ne peut pas être « parti du pont » ;
  il ne l'est qu'après 1,5 s continues en l'air (un rebond n'en est pas un) ; un remplaçant naît
  décalé s'il y a encore un engin du même type sur le pont (sinon la physique détruirait les deux) ;
  et si le précédent engin de départ n'a jamais été piloté, un remplaçant n'arrive que 10 s après
  le dernier. `scripts/test-start-pad.mjs`.
- Le recul d'un char garé qui tire (tireur de canon) est appliqué par le serveur
  (`ParkedHost.kick`).
- Un choc au-delà de `PLANE_CRASH_IMPACT`, une chute mortelle (rigs terrestres) ou une sortie de
  la pièce détruit le véhicule (`hp = 0`). Les constructions posées par les joueurs ne sont
  pas encore dans ce monde (seulement la pièce et le décor).
- Aucun client ne simule de véhicule vide : tous les types sont au serveur (hélicoptères compris,
  voir [heli-physics.md](heli-physics.md)) et le rapport `vacant` des clients n'existe plus.

## Intégration

`client.js` : `PLANE_TYPES` liste les types portés (un rig par type piloté) ; pour ceux-là, le pas de vol, la pose
au sol (`resolveLanding`) et les tests de boîtes de l'ancien chemin sont remplacés par
`planeRig.step`. L'instructeur reçoit les vitesses angulaires dans le repère de l'avion.

## Vérifications

`scripts/test-plane-physics.mjs` : courbe de portance, croisière en palier, décollage,
décrochage, atterrissage sur une pente de 7°, piqué contre le sol, et visée à la souris
(virages jusqu'à 170°) sans décrocher. Non vérifié : le ressenti (voir la section Essai).

## Essai en jeu

Biplan : décoller (gaz à fond, tirer vers 24 m/s), tenir la visée souris, virer serré,
ralentir jusqu'au décrochage, se poser sur un bureau incliné ou un livre, taper un meuble
(dégâts) et la pièce (murs, plafond).
