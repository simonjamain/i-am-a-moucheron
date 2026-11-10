# Carte du code actuel

JavaScript ESM natif, client Three.js et serveur Node en RAM. Lire
[gameplay](gameplay.md) pour les parcours, [exploitation](operations.md) pour lancer,
tester et livrer, puis la référence métier concernée. `AGENTS.md` décrit la prise
en charge continue du backlog et la revue finale des documents.

## Exécution et autorité

| Module                                     | Responsabilité                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `server/index.js`                          | Assets HTTP, santé, négociation WebRTC native, UDP obligatoire et maintenance.                 |
| `server/session.js`                        | Identité liée à DTLS, commandes fiables, confirmations/rejeu, mouvements sans retransmission.  |
| `server/game.js`                           | Salles, joueurs, vagues, sièges, contrats, achats, dégâts, réserve et réapparition en RAM.     |
| `src/udp-client.js`, `src/udp-protocol.js` | Canaux navigateur, refus hors UDP, limites, files et réassemblage.                             |
| `src/motion-wire.js`                       | Codec binaire des mouvements et lots partagés relayés par le serveur.                          |
| `src/client.js`                            | Orchestration de la scène, état local, entrées, interfaces et envoi des commandes.             |
| `src/network.js`                           | Validation de mouvement et interpolation ; `PeerMotion` est le transport historique des pairs. |
| `src/ground-motion.js`                     | Historique et interpolation visuelle des positions des ennemis terrestres reçues du serveur.   |

Les moucherons de grande nuée utilisent \`src/midge-batch.js\` (modèle Meshy animé par texture de sommets près de la caméra, trois meshes instanciés WebGL au loin, proxies logiques légers ; voir \`src/midge-model.js\` et [le pipeline d'assets](asset-pipeline.md#moucheron-meshy-squelette-et-vol)). Les fourmis et araignées pondeuses suivent la même chaîne (\`src/rigged-creature.js\`, \`src/creature-batch.js\`, \`src/walker-gait.js\`, \`src/walker-batch.js\`, \`src/ant-model.js\`, \`src/spider-model.js\`) avec une marche pilotée par la distance, \`waves.js\` (trajectoires indépendantes) et \`insect-hits.js\` (collisions sphériques). Le navigateur possède ses mouvements et raycasts dans un modèle coopératif.
Le serveur possède les transactions et simule les armes lourdes. Il n’y a ni
base de données ni accès disque dans les opérations de jeu Node. Voir
[réseau](walking-network.md) et [serveur UDP](udp-server.md).

## Modules de jeu

| Domaine              | Modules et référence                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unités/décor         | `scale.js`, `layout.js`, `office.js` ; [échelle](scale-fleet-weapons.md).                                                                                                                                                                                              |
| Géométrie            | `graphics.js`, modèles procéduraux ; `renderer.js` pour WebGL/secours.                                                                                                                                                                                                 |
| Vol et entrée        | `flight.js`, `mouse-flight.js`, `input.js`, `control-focus.js`, `fleet.js`, `vacant-flight.js`.                                                                                                                                                                        |
| Corps et purgatoire  | `base.js`, `purgatory-physics.js`, `sortie.js` ; [file](purgatory-queue.md).                                                                                                                                                                                           |
| Chute actuelle       | `field-physics.js` : gravité humaine convertie au ratio, gonflage, impact ; [physique actuelle](multiplayer-return.md).                                                                                                                                                |
| Armes                | `ballistics.js`, `combat.js`, `armament.js`, `ordnance.js`, `aircraft-fire.js`, `tracers.js`, `muzzle.js`, `insect-hits.js`.                                                                                                                                           |
| Visée/caméras        | `personal-aim.js` pour épaule/main ; `tank-reticle.js` pour les trajectoires de mire ; `tank-view.js` pour lunette, observation et bouche serveur.                                                                                                                     |
| Vagues               | `server/wave-preparation.js` tire et conserve la vague annoncée (sans vote ni plans depuis la version 264) ; `wave-council-ui.js` l'affiche avec le lancement anticipé. `waves.js`, `routes.js`, `route-speed.js`, `route-navigation.js`, `route-obstacles.js` généré. |
| Économie/réserves    | `equipment.js`, `logistics.js`, `bank.js`, `rewards.js` ; [logistique](logistics-contracts.md).                                                                                                                                                                        |
| Contrats             | `contracts.js`, gestion des papiers dans le client (annexes malicieuses retirées).                                                                                                                                                                                     |
| Lits                 | `beds.js` : accès et support ; `bed-ui.js` : document personnel et signature.                                                                                                                                                                                          |
| HUD/banque           | `hud.js`, `equipment-controls.js`, `bank-ui.js` ; [véhicules et banque](vehicles-bank.md).                                                                                                                                                                             |
| Mesure d’interaction | `interaction-timing.js` : feedback immédiat et traces bornées de sélection.                                                                                                                                                                                            |
| Effets/son           | `insect-status.js`, `crash-effects.js`, `audio.js`, effets de combat et corps tombants du client.                                                                                                                                                                      |

Les couloirs aériens et leur déformation sont partagés entre serveur et client dans
`routes.js` et `air-current.js`. Le client les affiche avec `air-trails.js`.

Les gerbes de sang purement visuelles sont gérées dans `blood-effects.js`,
avec un seul rendu instancié borné et une intégration aux impacts dans `client.js`.

## Dernier lot

[Lisibilité et nettoyage](clean-flight.md) : `purchase-ui.js` réutilise les protections
de signature de `BedUI` pour les bons. `equipment.js` calcule prix et compteurs
prépayés ; `server/game.js` possède commandes personnelles, poses, contacts et
salissure. `vehicle-care.js` porte dégâts et rayon du jet ; les effets décoratifs
restent côté client. `tank-reticle.js` réutilise l’intégrateur autoritaire des obus.
`fleet.js` / `graphics.js` / `logistics.js` décrivent le Spitfire S6 et ses réserves.
`test-clean-flight.mjs` couvre ce lot ; les tests natifs UDP exercent ses commandes
entre deux pairs. Le Worker conserve son ancien périmètre, sans Spitfire gratuit.

## Génération, tests et compatibilité

`scripts/assemble.mjs` utilise la géométrie réelle du bureau pour générer les
colliders et le graphe d’assets à URL de contenu. `worker/assets.js` est utilisé
par Node. `worker/index.js` et `dist/` sont les sorties du backend Worker
historique ; `src/server.js`, `drizzle/` et `scripts/local-db.mjs` restent sa
compatibilité SQL. Ils ne sont pas importés par le runtime Node.

`scripts/build-ui-preview.mjs` extrait HTML/CSS réels et les composants HUD,
banque et lit pour `/ui-review.html`. La page utilise une caisse de démonstration
sans réseau. `scripts/render-model-review.mjs` produit la comparaison CPU de
la géométrie VIS-05 à partir du commit précédent, lorsqu’un clone Git est disponible.

Les scripts de `package.json` sont la liste courante des commandes. Les tests
exécutent les modules, les gestionnaires UI et le domaine, avec tests natifs UDP
et compatibilité Worker séparés. `test-field-backlog.mjs` et `test-bed-ui.mjs`
couvrent le dernier lot. `check-docs.mjs` inventorie les Markdown et contrôle
leurs liens locaux ; leur exactitude fonctionnelle reste une revue sémantique.

## Retours multijoueurs courants

`live-hud.js` : valeurs au viseur et aide permanente. `salvos.js` : départs décalés et annulation d’occupation.
`tracers.js` : pool borné et effet personnel orienté vers l’avant ;
`insect-hits.js` : phase large puis intersections, avec tolérance du seul moucheron.
`server/game.js` : observation avant âme, réserve renouvelée et véhicules prépayés
à poser. `test-multiplayer-return.mjs` et `review-return-performance.mjs` couvrent
le [lot courant](multiplayer-return.md), complété par les vrais pairs UDP.

## Véhicules d’appui

`helicopter.js` porte le pilotage assisté, butées, origines et guidage borné.
`mobile-flak.js` porte unités de proximité et enveloppes de coque orientées ;
`swept-geometry.js` centralise les intersections balayées exactes ; `tank.js` réutilise ces balayages pour le long camion articulé.
`server/game.js` possède lancement/débit, armement différé et détonation fiable ;
`ordnance.js` conserve les paramètres de chaque départ. `graphics.js` produit
les deux modèles, `contracts.js` leurs rôles, `hud.js` leurs panneaux.
`test-support-vehicles.mjs` et les pairs natifs UDP couvrent le lot. Voir
[état de validation et limites](support-vehicles.md).

`routes.js` distingue portail décoratif et sortie visible ; `scale.js` centralise
le facteur du moucheron ; `client.js` recrée les meshes par vague/espèce.
`test-enemy-visibility.mjs` couvre la [visibilité courante](enemy-visibility.md).

`scale.js` centralise les six facteurs d’insectes, partagés par géométrie et
volumes de collision serveur. `waves.js` relève les corps terrestres au-dessus
du support ; `route-navigation.js` adapte leur marge. `test-enemy-readability.mjs`
mesure les silhouettes projetées et les vrais corps au sol.

Le [lot confort de jeu, version 37](comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.

Les [nuées densifiées](dense-swarms.md) multiplient les moucherons par cinq
et utilisent une grille spatiale pour le voisinage.

La [correction des commandes H2](helicopter-controls.md) couvre Z/O/Haut, S/Bas,
stationnaire, poussée locale et axe des roquettes.

Le [lot de retours du 30 octobre, version 48](returns-30-october.md) décrit les correctifs
physiques, sons/HUD, livraisons sous parachute et parcours du purgatoire.

`delivery.js` partage désormais le calcul de hauteur absolue entre serveur et
client ; les [issues 15–17](issues-15-16-17.md) décrivent ce contrat et les nouvelles commandes/vitesses.

La [référence performance](performance.md) décrit la sélection spatiale des
cibles des tirs, ses replis conservateurs et le benchmark CPU reproductible,
ainsi que le rejet conservateur des collisions véhicule–ennemi côté serveur
et sa mesure à 50 véhicules pour 900 insectes.

Les règles d’équilibrage sont fixes (`DEFAULT_BALANCE`, `src/balance.js`) ; l’ancien
outil de [réglage par room](room-balance.md) est retiré au profit du
[mode debug](laboratory.md) (`lab-ui.js`, commande serveur `lab`).

Les paramètres de l'instructeur de vol sont enregistrés uniquement dans le
navigateur par `flight-tuning.js` et présentés par `flight-tuning-ui.js`.
Leur portée et leurs commandes sont décrites dans
[les réglages personnels des avions](controls.md#réglages-personnels-des-avions).

Le [bestiaire](enemy-bestiary.md) s'appuie sur `waves.js` et `routes.js` (profils, origine de naissance, trajectoires), `server/game.js` (mort unique et roster révisé), `graphics.js` (animaux procéduraux) et `spiderling-batch.js` (trois meshes instanciés).

`ground-defense-ui.js` affiche le menu, l’aperçu de pose en troisième personne et
les constructions ; `placement-aim.js` calcule la surface visée pour les défenses et les achats.
`ground-placement.js` détermine les deux extrémités depuis ce point
et prévalide sur une copie de l’état avec `ground-defense-state.js`. La commande
fiable `ground-defense` reste autoritaire dans `server/game.js` ; le déplacement
des terrestres reste dans `ground-creatures.js`. Voir [gameplay](gameplay.md#défenses-terrestres).

`brick-wall.js` répète en instances la brique 2×4 de `meshy-brick-data.js` (tenons vers +Y, dimensions `BRICK_PITCH`/`BRICK_ROW`/`BRICK_DEPTH`) selon la longueur des segments, recolorée par instance, sans modifier les collisions ni le coût serveur.

`character-model.js` anime le personnage joueur de `character-data.js` (squelette Mixamo, repos/marche/course, poses procédurales assis, chute et pistolet) ; `graphics.humanoid()` l'enveloppe dans le cadre invisible du pistolet ([pipeline d'assets](asset-pipeline.md#personnage-joueur-meshy--mixamo)).

`b3-model.js` et `meshy-b3-data.js` portent le [B3 texturé à quatre places](b3-model.md) ; `fleet.js` définit ses quatre postes et `vehicle-livery.js` son repère coloré.
Les autres véhicules Meshy utilisent `meshy-texture.js` pour le décodage
commun des maillages UV et des atlas. Le Spitfire, le T3, le D2 (dans
`graphics.js`), le H2 (`h2-model.js`) et le B3 (`b3-model.js`) sont des
hiérarchies articulées construites par `meshy-rig.js` depuis les modules générés
par `scripts/import-meshy-vehicle.py` ; `vehicle-anchors.js` donne à la physique
(`tank-view.js`, `mobile-flak.js`, `tank.js`, `helicopter.js`) les pivots, bouches
et enveloppes de ces modèles. Le M1 (`m1-model.js`) et le Stuka (`graphics.js`)
suivent le même chemin depuis la version 266.

G1 Castor (issue #76) : `fleet.js` définit le véhicule monoplace,
`tank.js` sa physique de sol, `paid-service.js` son rayon de soutien et ses coûts,
`castor-model.js` assemble le modèle Meshy texturé (coque, six roues, tourelle et
canon pivotants) généré hors ligne par `scripts/import-meshy-castor.py`,
`castor-top-view.js` la vue de dessus (V) et son viseur au sol, `client.js` la
conduite et la visée. `service-zones.js` dessine les sphères vertes de
ravitaillement des stations fixes et des Castor, aux rayons de `logistics.js`.

La construction embarquée dans le Castor (PR #80) partage
`GroundDefenseUI`, `groundPlacement` et `placement-aim` avec les piétons.
`server/game.js` vérifie le pilote, la position du Castor et chaque segment,
retire les coûts de la caisse et déduplique les requêtes identifiées.

Les trois constructions propres au Castor, accessibles à leur seul prix en dollars
(plus de cartes d'ingénierie depuis la version 264), sont la tourelle automatique (`ground-sentry.js`),
le bunker LEGO et le canon antichar occupables (`ground-fortifications.js`).
`fortification-model.js` dessine ces postes ; le canon antichar est l'obusier
Meshy articulé de `howitzer-model.js` / `howitzer-data.js` (pointage lent, roues
contrarotatives, élévation et recul, [pipeline d'assets](asset-pipeline.md#canon-anti-matériel-obusier-meshy)).
`ground-defense-state.js` contrôle leur placement et les collisions ;
`server/game.js` crée les postes occupables, vérifie les signatures et les tirs,
et conserve des réserves finies. `paid-service.js` les répare et recharge uniquement
près du Castor ou des stations, en débitant la caisse commune. `client.js` affiche
leurs modèles et postes 3D. Voir [note de reprise Castor](tasks/g1-castor.md).

Les modèles de constructions sont partagés entre le rendu final et l’aperçu :
`ground-model.js` pour les défenses, `fortification-model.js` pour les postes
occupables. `model-preview.js` gère les matériaux transparents et leur durée de
vie sans libérer les géométries/textures Meshy partagées.
