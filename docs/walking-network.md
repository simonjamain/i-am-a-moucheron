# Autorité et corps partagés

Qui simule quoi dans une partie à plusieurs, et comment les corps des joueurs
sont partagés. Le transport (canaux, lots de mouvements, commandes fiables,
reprise de session) est décrit dans [serveur et transport](udp-server.md) ; la
règle de confiance dans [confiance envers les clients](trust-model.md).

## Répartition

- **Chaque navigateur possède sa physique** : son corps au bureau et au
  purgatoire, son engin piloté, ses visées et ses tirs. Mouvement et collisions
  sont calculés localement, sans attendre le serveur ; il n'y a ni rejeu ni
  réconciliation serveur du mouvement local.
- **Les autres corps sont des proxies cinématiques** interpolés (`MotionTrack`,
  `src/network.ts`). Une collision ne déplace que le corps local : on peut se
  pousser approximativement, sans simulation rigide globale déterministe.
- **Le serveur** (`server/game.js`) garde les règles partagées : PV, sièges,
  contrats, stocks, argent. Il stocke et relaie les corps rapportés et
  n'avance jamais l'arène du bureau. Il simule lui-même les insectes au sol,
  les tourelles automatiques et les engins sans pilote
  ([véhicule sans pilote](physics-engine.md#engins-sans-pilote--le-serveur)).
- **Tirs** : projectiles et munitions sont prédits immédiatement, puis débités
  par lots idempotents ; les réponses ne créent pas de projectiles
  ([logistique](logistics-contracts.md)). Les armes lourdes sont simulées par
  leur tireur, qui rapporte leurs impacts ([véhicules et armes](scale-fleet-weapons.md)).
- **Dégâts** : enregistrés à part du mouvement, avec un identifiant
  d'incarnation et un registre d'impacts idempotent ; un rapport de mouvement
  ne peut pas réinitialiser les dégâts ([combat et mondes](combat-worlds.md)).

Un snapshot accepté fusionne présence, papiers et corps distants, mais conserve
le corps local et le temps de simulation pour la même époque d'arène et le même
identifiant de corps. Une nouvelle incarnation (réapparition, reset) recrée un
corps neuf, y compris au bureau pour ne pas garder le lieu de mort. Identité de
session, incarnation et numéro d'occupation empêchent une ancienne position de
modifier un nouveau corps ou un nouveau poste.

Les formulaires envoient le dernier rapport de corps : le serveur utilise cette
position (de confiance) pour les contrôles de proximité, vérifie l'accusé de
signature et l'ordre des documents, et sérialise signatures et embarquements.

## PNJ du purgatoire

Le premier joueur connecté présent au purgatoire, par ordre lexicographique
d'identifiant, simule les PNJ ; le serveur publie cet hôte (`arena.host`). Un
changement d'hôte importe le dernier snapshot des PNJ ; un hôte déconnecté
expire après le délai de présence (12 s). Sans joueur au purgatoire, le serveur
fait avancer le service avec `advancePurgatory` (`src/purgatory-queue.ts`) à
chaque requête et à chaque tick ; cette exception n'intègre aucun mouvement de
joueur. Un onglet en arrière-plan ralentit un hôte humain.

## Moteur de marche commun

`src/walk-arena.ts` est le moteur de tous les mondes où l'on marche : corps
(`WalkBody`), mouvement à pas fixe, collisions, limites, obstacles et relais
réseau (`bodyMotion`, `mergeOwnedArena`, `relayBodyReport`). Chaque monde ajoute
son comportement par des `WalkRules` : `OFFICE_RULES` (`src/base.ts` : chutes,
aucun PNJ) et `PURGATORY_RULES` (`src/purgatory-queue.ts` : file des insectes,
guichet de Saint Pierre, file VIP). Un corps relayé ne porte que du mouvement
(position, vitesse, orientation, intention, état dans la file).

Bureau et purgatoire partagent la même description d'un marcheur
(`WALK_WORLDS`, `src/scale.ts`) : chaque monde ne donne que ses unités de scène
par mètre (`sceneScale`) et ses mètres par unité d'arène (`arenaMetres`). En
découlent la taille du modèle (`humanoidScale`, 1,8 m), l'accélération
(`walkAcceleration`, course de référence de 6 m/s), la vitesse d'animation
(`walkSpeed`), le rayon de collision et le saut, la chute et l'appui au sol
(`stepWalker`, `src/sortie.ts`, qui déplace une capsule avec le contrôleur de
personnage de Rapier dans `WalkerWorld`). Côté client (`src/client.js`), `groundCamera`
cadre la caméra d'épaule (champ de 62° dans les deux mondes) et `makeWalker`,
`poseWalker` et `walkerSteps` créent, orientent, animent et font marcher tous
les personnages à pied.

Le rayon de déplacement est unique, en mètres de référence : `WALKER_RADIUS`
(0,176 m), soit `SOUL_RADIUS` = 0,24 unité au purgatoire et `BASE_WALK_RADIUS`
au bureau. Il sert aux collisions entre joueurs (solides, jamais traversables)
et avec le mobilier ; les volumes de tir sont distincts. Les pas ne sonnent
qu'avec un appui au sol (`footstepsAudible`), jamais en chute libre ni sous
parachute.

## Saut, chute et parachute

`src/field-physics.ts` porte la physique verticale du marcheur, en mètres de référence
convertis par `MAP.ratio` : `jumpWalker` lance un saut depuis le sol seulement, sans voile
(`WALKER_JUMP_SPEED` 4,9 m/s, sommet vers 1,2 m) ; `WALKER_FALL` fixe gravité (9,81), vitesse
terminale (54 m/s, 5,5 m/s sous voile), gonflement de la voile (0,25 s) et seuils d'impact
(sans dégât jusqu'à 6 m/s, mortel à 20 m/s, `impactDamage` quadratique entre les deux).
`src/sortie.ts` intègre la chute par sous-pas (`stepWalkerFall`). La chute libre commence
au-delà de `WALKER_FREEFALL_SPEED` (5,6 m/s de descente), qu'un simple saut n'atteint pas :
c'est aussi la condition pour ouvrir le parachute (`toggleParachute`, `src/ballistics.ts`).
Les poses en l'air (impulsion, chute libre à plat ventre, suspension sous voile) sont
procédurales : `src/walker-air-pose.ts`.

## Un seul monde pour le bureau et le purgatoire

Le purgatoire est un lieu du même monde que le bureau, en mètres du bureau : le
nuage de Saint Pierre flotte au-dessus de la pièce, 150 m de référence plus haut
que le plafond (`PURGATORY_FRAME`, `src/arena-frame.ts` : sol à
`OFFICE_CEILING` + `PURGATORY_ALTITUDE`, centré sur la pièce). Un appareil y
monte sans changer de repère ([ciel du purgatoire](purgatory-sky.md)).

- Chaque lieu garde ses coordonnées planes d'arène pour ses règles (places de la
  file, baies du hangar) ; un **repère** (`ArenaFrame` : origine, mètres par
  unité, axe z inversé ou non) les place dans le monde. `OFFICE_FRAME`
  (`src/base.ts`) suit l'origine du plan actif, en unités d'acteur, z inversé ;
  `PURGATORY_FRAME` garde l'unité de la file (2,46 unités pour 1,8 m).
- La hauteur `y` d'un corps est une hauteur du monde dans les deux lieux. Une
  âme marche, saute et retombe avec `stepWalker` sur les boîtes du purgatoire
  (sol du nuage, guichet).
- Le décor (`createPurgatoryScene`) est construit en unités d'arène dans un
  groupe placé par le repère ; âmes, insectes de la file, caméra et sons sont en
  mètres du bureau.
- Le client dessine la scène du bureau ou celle du purgatoire, jamais les deux.

## Vérifier

- `scripts/test-client-authority.mjs` : un snapshot ancien (retards de 40 à
  1 500 ms) n'écrase pas la position du propriétaire ; métadonnées et reset.
- `scripts/test-client-physics.mjs` : le pas local ne déplace jamais un proxy.
- `scripts/test-walk-collisions.mjs`, `scripts/test-walk-worlds.mjs`,
  `scripts/test-walker-jump.mjs` : rayon, solidité, mobilier, pas, cadrage et
  vitesse identiques.
- `scripts/test-arena-frame.mjs` : altitude, repères, décor, marche d'une âme
  contre le guichet ; scénario navigateur `scripts/e2e-purgatory-walk.mjs`.

Le ressenti multijoueur à haute fréquence d'images reste à vérifier en partie
réelle.
