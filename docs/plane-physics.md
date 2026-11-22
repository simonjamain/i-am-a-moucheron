# Vol du biplan sur Rapier

Le biplan (type `fighter`) est un corps rigide Rapier (`src/plane-physics.ts`, classe
`PlaneRig`), piloté par des forces. Les autres avions gardent le pas arcade de
`src/flight.ts` tant qu'ils ne sont pas portés. Les avions vides laissés dans la salle
(`vacant-flight.ts`) utilisent encore l'ancien modèle.

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
- **Cellule** : cinq colliders (fuselage, deux ailes, empennage, dérive), CCD activé. Les
  impulsions de contact donnent `state.impact` (variation de vitesse en m/s de référence) :
  au-delà de 2,5 l'avion prend des dégâts, au-delà de `PLANE_CRASH_IMPACT` (16) il est
  détruit. Murs et plafond de la pièce gardent la règle à vitesse du client.

## Avion garé : le serveur (`src/plane-host.ts`)

Quand le pilote d'un biplan en sort (à l'arrêt ou en parachute), l'avion est marqué
`hosted` par le serveur (`vehicle-exit`, `server/game.js`) et simulé **par le serveur** avec
le même `PlaneRig` : moteur coupé, freins serrés (courbe de friction raide : pas de
reptation sur une pente). Rapier tourne dans Node (`@dimforge/rapier3d-compat`, passé en
dépendance de production ; chargé à la première sortie, le décor d'un plan est construit
une fois par processus, environ 150 ms).

- Un `PlaneHost` par room : un seul monde Rapier, le décor copié une fois, tous les avions
  garés dedans. Pas pour les avions jamais utilisés (ils gardent leur état sans calcul).
- **Sommeil** : laissé à Rapier (les forces n'appliquent pas de réveil pour un avion garé) :
  au repos il s'endort et ne coûte plus rien ; un avion endormi n'envoie plus de mises à
  jour. Dès qu'un pilote s'assoit, l'avion quitte le monde du serveur et le client reprend
  l'autorité.
- Un choc au-delà de `PLANE_CRASH_IMPACT` ou une sortie de la pièce détruit l'avion
  (`hp = 0`). Les constructions posées par les joueurs ne sont pas encore dans ce monde
  (seulement la pièce et le décor).
- Le client hôte ne simule plus les biplans vides (`simulateVacantAircraft`) ; les autres
  engins vides gardent leur simulation actuelle, à porter ensuite sur le même principe.

## Intégration

`client.js` : `PLANE_RIGS` liste les types portés ; pour ceux-là, le pas de vol, la pose
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
