# Carte du code actuel

ESM natif en migration progressive vers TypeScript (types effacés à l'exécution,
sans bundler : voir [TypeScript](typescript.md)), client Three.js et serveur Node
en RAM. Les types partagés sont dans `src/types.ts`. Lire
[gameplay](gameplay.md) pour les parcours, [exploitation](operations.md) pour lancer,
tester et livrer, puis la référence métier concernée. `AGENTS.md` décrit la boucle de travail, la livraison et la fusion autonome.

## Exécution et autorité

| Module                                     | Responsabilité                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `server/index.js`                          | Assets HTTP, santé, négociation WebRTC native, secours WebSocket `/ws` et maintenance.           |
| `server/session.ts`                        | Identité liée à DTLS, commandes fiables, confirmations/rejeu, mouvements sans retransmission.    |
| `server/stats.ts`, `server/stats-page.ts`  | Puissance pratique des équipements, routes `/stats` et `/stats.json` ([statistiques](stats.md)). |
| `server/game.js`                           | Salles, joueurs, vagues, sièges, contrats, achats, dégâts, réserve et réapparition en RAM.       |
| `src/udp-client.ts`, `src/udp-protocol.ts` | Canaux navigateur, refus hors UDP, limites, files et réassemblage.                               |
| `src/ws-client.js`                         | Secours TCP : même interface et protocole que `UdpClient` sur un WebSocket.                      |
| `src/motion-wire.ts`                       | Codec binaire des mouvements et lots partagés relayés par le serveur.                            |
| `src/client.js`                            | Orchestration de la scène, état local, entrées, interfaces et envoi des commandes.               |
| `src/network.ts`                           | Validation de mouvement et interpolation ; `PeerMotion` est le transport historique des pairs.   |
| `src/ground-motion.ts`                     | Historique et interpolation visuelle des positions des ennemis terrestres reçues du serveur.     |

Les moucherons de grande nuée utilisent `src/midge-batch.js` (modèle Meshy animé par texture de sommets près de la caméra, trois meshes instanciés WebGL au loin, proxies logiques légers ; voir `src/midge-model.js` et [le pipeline d'assets](asset-pipeline.md#moucheron-meshy-squelette-et-vol)). Les fourmis et araignées pondeuses suivent la même chaîne (`src/rigged-creature.ts`, `src/creature-batch.ts`, `src/walker-gait.ts`, `src/walker-batch.js`, `src/ant-model.js`, `src/spider-model.js`, `src/roach-model.js`, `src/spiderling-model.js`, `src/rat-model.js` qui rejoue un clip) avec une marche pilotée par la distance ; le scarabée volant (`brute`) l'abeille (`guard`) et le moustique aussi, via `src/flyer-batch.js`, `src/beetle-model.js`, `src/bee-model.js` et `src/mosquito-model.js`, avec un battement d'ailes sur l'horloge partagée ; `waves.js` (trajectoires indépendantes) et `insect-hits.ts` (collisions sphériques). Le navigateur possède ses mouvements et raycasts dans un modèle coopératif.
Le serveur possède les transactions et simule les armes lourdes. Il n’y a ni
base de données ni accès disque dans les opérations de jeu Node. Voir
[réseau](walking-network.md) et [serveur UDP](udp-server.md).

## Modules de jeu

| Domaine              | Modules et référence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unités/décor         | `scale.ts`, `layouts.ts` (plans de bureau), `layout.ts`, `office.ts`, `office-props.ts` (objets placés, collisions), `office-pack.ts` (rendu instancié), `office-lights.ts` ([lampes et ombres](office-lighting.md)), `collision-mesh.ts`/`office-collision.ts` ([collisions en triangles](collisions.md)), `office-pack-catalog.ts`/`office-pack-data.js` (pack importé) ; [plans](office-layouts.md), [échelle](scale-fleet-weapons.md). |
| Géométrie            | `graphics.js`, modèles procéduraux ; `renderer.ts` pour WebGL/secours.                                                                                                                                                                                                                                                                                                                                                                     |
| Vol et entrée        | `flight.ts`, `mouse-flight.ts`, `input.ts`, `control-focus.ts`, `fleet.ts`, `vacant-flight.ts`.                                                                                                                                                                                                                                                                                                                                            |
| Corps et purgatoire  | `base.ts`, `purgatory-physics.ts`, `sortie.ts` ; [file](purgatory-queue.md).                                                                                                                                                                                                                                                                                                                                                               |
| Chute actuelle       | `field-physics.ts` : gravité humaine convertie au ratio, gonflage, impact ; [physique actuelle](multiplayer-return.md).                                                                                                                                                                                                                                                                                                                    |
| Armes                | `ballistics.ts`, `combat.ts`, `armament.ts`, `ordnance.js`, `aircraft-fire.ts`, `tracers.ts`, `muzzle.ts`, `insect-hits.ts`.                                                                                                                                                                                                                                                                                                               |
| Tourelles auto       | `ground-sentry.ts` (règles, tir serveur), `sentry-model.ts`, `gatling-model.ts`, `ground-defense-ui.js` (visée, rotation, tirs étalés, voix) ; [Gatling](gatling-turret.md), [T-01](t01-asset.md).                                                                                                                                                                                                                                         |
| Visée/caméras        | `personal-aim.ts` pour épaule/main ; `tank-reticle.js` pour les trajectoires de mire ; `tank-view.js` pour lunette, observation et bouche serveur.                                                                                                                                                                                                                                                                                         |
| Vagues               | `enemy-power.ts` calcule la puissance des espèces ([équilibrage](enemy-power.md#unité-commune)) ; `server/wave-preparation.js` tire et conserve la vague annoncée (sans vote ni plans depuis la version 264) ; `wave-council-ui.js` l'affiche avec le lancement anticipé. `waves.js`, `routes.js`, `route-speed.js`, `route-navigation.ts` ; obstacles dérivés du plan actif (`layouts.ts`).                                               |
| Économie/réserves    | `equipment.ts`, `logistics.ts`, `bank.ts`, `rewards.ts` ; [logistique](logistics-contracts.md).                                                                                                                                                                                                                                                                                                                                            |
| Contrats             | `contracts.ts`, gestion des papiers dans le client (annexes malicieuses retirées).                                                                                                                                                                                                                                                                                                                                                         |
| Lits                 | `beds.ts` : accès et support ; `bed-ui.ts` : document personnel et signature.                                                                                                                                                                                                                                                                                                                                                              |
| HUD/banque           | `hud.js`, `equipment-controls.ts`, `bank-ui.ts` ; [véhicules et banque](vehicles-bank.md).                                                                                                                                                                                                                                                                                                                                                 |
| Mesure d’interaction | `interaction-timing.ts` : feedback immédiat et traces bornées de sélection.                                                                                                                                                                                                                                                                                                                                                                |
| Effets/son           | `insect-status.ts`, `crash-effects.ts`, effets de combat et corps tombants du client ; son : bibliothèque `audio/` et adaptateur `game-audio/` ([audio](audio.md)).                                                                                                                                                                                                                                                                        |

Les couloirs aériens sont partagés entre serveur et client dans `routes.js`.

Les gerbes de sang purement visuelles sont gérées dans `blood-effects.ts`,
avec un seul rendu instancié borné et une intégration aux impacts dans `client.js`.

Le HUD contextuel (`src/hud.js`) affiche les lignes de détail à partir du modèle
du poste. Le HTML fournit uniquement le titre, la valeur principale et un
conteneur par panneau. La vue du Flak lourd est calculée avec celle des autres
postes dans `updateVehicles()`, avant le rendu de la scène.

## Achats prépayés et salissure

[Lisibilité et nettoyage](clean-flight.md) : `purchase-ui.js` réutilise les protections
de signature de `BedUI` pour les bons. `equipment.ts` calcule prix et compteurs
prépayés ; `server/game.js` possède commandes personnelles, poses, contacts et
salissure. `vehicle-care.js` porte dégâts et rayon du jet ; les effets décoratifs
restent côté client. `tank-reticle.js` réutilise l’intégrateur autoritaire des obus.
`fleet.ts` / `graphics.js` / `logistics.ts` décrivent le Spitfire S6 et ses réserves.
`test-clean-flight.mjs` couvre ce lot ; les tests natifs UDP exercent ses commandes
entre deux pairs.

## Génération, tests et compatibilité

`scripts/assemble.mjs` utilise la géométrie réelle du bureau pour générer les
colliders et le graphe d’assets à URL de contenu. `server/assets.js` est utilisé
par Node. `dist/` (ignoré par Git) est la sortie du build Node autonome.

`scripts/build-ui-preview.mjs` extrait HTML/CSS réels et les composants HUD,
banque et lit pour `/ui-review.html`. La page utilise une caisse de démonstration
sans réseau. `scripts/render-model-review.mjs` produit la comparaison CPU de
la géométrie VIS-05 à partir du commit précédent, lorsqu’un clone Git est disponible.

Les scripts de `package.json` sont la liste courante des commandes. Les tests
exécutent les modules, les gestionnaires UI et le domaine, avec tests natifs UDP
séparés. `test-field-backlog.mjs` et `test-bed-ui.mjs`
couvrent le dernier lot. `check-docs.mjs` inventorie les Markdown et contrôle
leurs liens locaux ; leur exactitude fonctionnelle reste une revue sémantique.

## Retours multijoueurs

`live-hud.ts` : valeurs au viseur et aide permanente. `salvos.ts` : départs décalés et annulation d’occupation.
`tracers.ts` : pool borné et effet personnel orienté vers l’avant ;
`insect-hits.ts` : phase large puis intersections, avec tolérance du seul moucheron.
`server/game.js` : observation avant âme, réserve renouvelée et véhicules prépayés
à poser. `test-multiplayer-return.mjs` et `review-return-performance.mjs` couvrent
le [lot courant](multiplayer-return.md), complété par les vrais pairs UDP.

## Véhicules d’appui

`helicopter.js` porte le pilotage assisté, butées, origines et guidage borné.
`mobile-flak.js` porte unités de proximité et enveloppes de coque orientées ;
`swept-geometry.ts` centralise les intersections balayées exactes (`mobile-flak.js` s'en sert pour le long camion articulé, tracteur et remorque).
`server/game.js` possède lancement/débit, armement différé et détonation fiable ;
`ordnance.js` conserve les paramètres de chaque départ. `graphics.js` produit
les deux modèles, `contracts.ts` leurs rôles, `hud.js` leurs panneaux.
`test-support-vehicles.mjs` et les pairs natifs UDP couvrent le lot. Voir
[état de validation et limites](support-vehicles.md).

`routes.js` distingue portail décoratif et sortie visible ; `scale.ts` centralise
le facteur du moucheron ; `client.js` recrée les meshes par vague/espèce.
`test-enemy-visibility.mjs` couvre la [visibilité courante](enemy-visibility.md).

`scale.ts` centralise les six facteurs d’insectes, partagés par géométrie et
volumes de collision serveur. `waves.js` relève les corps terrestres au-dessus
du support ; `route-navigation.ts` adapte leur marge. `test-enemy-readability.mjs`
mesure les silhouettes projetées et les vrais corps au sol.

`delivery.ts` partage le calcul de hauteur absolue des colis entre serveur et
client ([colis](logistics-contracts.md#colis-parachutés)).

La [référence performance](performance.md) décrit la sélection spatiale des
cibles des tirs, ses replis conservateurs et le benchmark CPU reproductible,
ainsi que le rejet conservateur des collisions véhicule–ennemi côté serveur
et sa mesure à 50 véhicules pour 900 insectes.

Les règles d’équilibrage sont fixes (`DEFAULT_BALANCE`, `src/balance.js`, voir
[puissance](enemy-power.md)) ; le [mode debug](laboratory.md) (`lab-ui.ts`, commande serveur `lab`). Ses outils de
test des ennemis : `debug-enemies.ts` (entrées de roster partagées serveur/tests)
et `debug-tools.ts` (colonnes du marchand, pose, dégâts des mannequins, hitbox et
portées, côté client).

Les paramètres de l'instructeur de vol sont enregistrés uniquement dans le
navigateur par `flight-tuning.ts` et présentés par `flight-tuning-ui.ts`.
Leur portée et leurs commandes sont décrites dans
[les réglages personnels des avions](controls.md#réglages-personnels-des-avions).

Le [bestiaire](enemy-bestiary.md) s'appuie sur `waves.js` et `routes.js` (profils, origine de naissance, trajectoires), `server/game.js` (mort unique et roster révisé), `graphics.js` (repli riggé des modèles Meshy) et `walker-batch.js` (bébés araignées instanciés comme les autres marcheurs).

`ground-defense-ui.js` affiche le menu, l’aperçu de pose en troisième personne et
les constructions ; `placement-aim.ts` calcule la surface visée pour les défenses et les achats.
`ground-placement.js` détermine les deux extrémités depuis ce point
et prévalide sur une copie de l’état avec `ground-defense-state.js`. La commande
fiable `ground-defense` reste autoritaire dans `server/game.js` ; le déplacement
des terrestres associe `ground-crowd.js` (sous-pas communs et voisinage spatial)
à `ground-creatures.js` (navigation individuelle, séparation douce et pièges). Voir [gameplay](gameplay.md#défenses-terrestres).

`brick-wall.ts` répète en instances la brique 2×4 de `meshy-brick-data.js` (tenons vers +Y, dimensions `BRICK_PITCH`/`BRICK_ROW`/`BRICK_DEPTH`) selon la longueur des segments, recolorée par instance, sans modifier les collisions ni le coût serveur.

`character-appearances.ts` liste les huit personnages au choix (validés aussi par le serveur à la connexion) et `appearance-picker.js` affiche le sélecteur de l'accueil ; `character-model.ts` anime le personnage joueur choisi (`character-data.js` par défaut, les autres `character-<id>-data.js` chargés à la demande) (squelette Mixamo, repos/marche/course, poses procédurales assis, chute et pistolet) ; `graphics.humanoid()` l'enveloppe dans le cadre invisible du pistolet ([pipeline d'assets](asset-pipeline.md#personnage-joueur-meshy--mixamo)).

`paper-form.ts` fournit les documents papier (clauses à cocher à la main, coche au crayon, tampons, clause refusée) ; `purchase-ui.js` l’applique au bon de commande ([règles d’interface](ui-guidelines.md#menus--des-documents-qui-sortent-du-monde)).

`seat-posts.ts` (partagé client/serveur) donne les postes visables de chaque engin (un par siège, une cabine pour les passagers), leurs zones de visée, le choix du poste touché (`aimPost`) et la portée ; `post-highlight.ts` dessine le contour bleu signal du poste ou de l’installation survolés, en post-traitement à l’écran comme les contours du rendu dessin animé (masque des pièces du poste, puis trait autour de sa silhouette) ([règles d’interface](ui-guidelines.md#monter-dans-un-engin--viser-le-poste)).

`biplane-model.ts`, `meshy-biplane-data.js` et `meshy-biplane-bomber-data.js` portent le [chasseur et le bombardier biplans](biplane-models.md) ; `fleet.ts` définit leurs postes (le bombardier : pilote et mitrailleur) et `vehicle-livery.ts` leurs plaques de nom.
Les autres véhicules Meshy utilisent `meshy-texture.ts` pour le décodage
commun des maillages UV et des atlas. Le Spitfire, le T3, le D2 (dans
`graphics.js`), le H2 (`h2-model.ts`) et les deux biplans (`biplane-model.ts`) sont des
hiérarchies articulées construites par `meshy-rig.ts` depuis les modules générés
par `scripts/import-meshy-vehicle.py` ; `vehicle-anchors.js` donne à la physique
(`tank-view.js`, `mobile-flak.js`, `truck-physics.ts`, `helicopter.js`) les pivots, bouches
et enveloppes de ces modèles. Le Stuka (`graphics.js`) suit le même chemin depuis
la version 266, les biplans depuis la version 275.

G1 Castor (issue #76) : `fleet.ts` définit le véhicule monoplace,
sa physique de sol (tous les véhicules au sol roulent sur Rapier : `physics-world.ts`, `castor-physics.ts`, `tank-physics.ts`, `truck-physics.ts`, voir [la physique Rapier](physics-engine.md)), `paid-service.js` son rayon de soutien et ses coûts,
`castor-model.ts` assemble le modèle Meshy texturé (coque, six roues, tourelle et
canon pivotants) généré hors ligne par `scripts/import-meshy-castor.py`,
`castor-top-view.ts` la vue de dessus (V) et son viseur au sol, `client.js` la
conduite et la visée. `service-zones.ts` dessine les sphères vertes de
ravitaillement des stations fixes et des Castor, aux rayons de `logistics.ts`.

Castor volant : `fleet.ts` le définit (un pilote, trois passagers, rotor et
soutien via `isRotorcraft` / `isSupportVehicle`), `helicopter.js` le fait voler
(lacet clavier pour la vue verticale), `flying-castor-model.ts` assemble le modèle
Meshy (`meshy-flying-castor-data.js`, `scripts/import-meshy-flying-castor.py`).
`airdrop.ts` partage cap, point et surface de largage entre le serveur
(`Game.airdrop` et `advanceGroundDrops` dans `server/game.js`) et l'aperçu
(`airdropPlacement` dans `ground-placement.js`, `GroundDefenseUI.updateAirdrop`
et `renderDrops`). Les constructions sur un meuble portent `y` ; `floorStructures`
et `navigationStructures` les retirent de ce que voient les insectes au sol.

La construction embarquée dans le Castor (PR #80) partage
`GroundDefenseUI`, `groundPlacement` et `placement-aim` avec les piétons.
`server/game.js` vérifie le pilote, la position du Castor et chaque segment,
retire les coûts de la caisse et déduplique les requêtes identifiées.

Les trois constructions propres au Castor, accessibles à leur seul prix en dollars
(plus de cartes d'ingénierie depuis la version 264), sont les tourelles automatiques T-01 et [Gatling](gatling-turret.md) (`ground-sentry.ts`),
le canon antichar occupable (`ground-fortifications.ts`).
`fortification-model.ts` dessine ce poste : c’est l'obusier
Meshy articulé de `howitzer-model.ts` / `howitzer-data.js` (pointage lent, roues
contrarotatives, élévation et recul, [pipeline d'assets](asset-pipeline.md#canon-anti-matériel-obusier-meshy)).
`ground-defense-state.js` contrôle leur placement et les collisions ;
`server/game.js` crée les postes occupables, vérifie les signatures et les tirs,
et conserve des réserves finies. `paid-service.js` les répare et recharge uniquement
près du Castor ou des stations, en débitant la caisse commune. `client.js` affiche
leurs modèles et postes 3D.

Les modèles de constructions sont partagés entre le rendu final et l’aperçu :
`ground-model.js` pour les défenses, `fortification-model.ts` pour les postes
occupables. `model-preview.ts` gère les matériaux transparents et leur durée de
vie sans libérer les géométries/textures Meshy partagées.
