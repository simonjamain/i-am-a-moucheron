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
| `src/client.js`                            | Orchestration de la scène, état local, entrées, interfaces et envoi des commandes.             |
| `src/network.js`                           | Validation de mouvement et interpolation ; `PeerMotion` est le transport historique des pairs. |

Le navigateur possède ses mouvements et raycasts dans un modèle coopératif.
Le serveur possède les transactions et simule les armes lourdes. Il n’y a ni
base de données ni accès disque dans les opérations de jeu Node. Voir
[réseau](walking-network.md) et [serveur UDP](udp-server.md).

## Modules de jeu

| Domaine              | Modules et référence                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unités/décor         | `scale.js`, `layout.js`, `office.js` ; [échelle](scale-fleet-weapons.md).                                                                          |
| Géométrie            | `graphics.js`, modèles procéduraux ; `renderer.js` pour WebGL/secours.                                                                             |
| Vol et entrée        | `flight.js`, `mouse-flight.js`, `input.js`, `control-focus.js`, `fleet.js`, `vacant-flight.js`.                                                    |
| Corps et purgatoire  | `base.js`, `purgatory-physics.js`, `sortie.js` ; [file](purgatory-queue.md).                                                                       |
| Chute actuelle       | `field-physics.js` : gravité humaine convertie au ratio, gonflage, impact ; [physique actuelle](multiplayer-return.md).                            |
| Armes                | `ballistics.js`, `combat.js`, `armament.js`, `ordnance.js`, `aircraft-fire.js`, `tracers.js`, `insect-hits.js`.                                    |
| Visée/caméras        | `personal-aim.js` pour épaule/main ; `tank-reticle.js` pour les trajectoires de mire ; `tank-view.js` pour lunette, observation et bouche serveur. |
| Vagues               | `waves.js`, `routes.js`, `route-speed.js`, `route-navigation.js`, `route-obstacles.js` généré.                                                     |
| Économie/réserves    | `equipment.js`, `logistics.js`, `bank.js`, `rewards.js` ; [logistique](logistics-contracts.md).                                                    |
| Contrats             | `contracts.js`, `malice.js`, gestion des papiers dans le client.                                                                                   |
| Lits                 | `beds.js` : accès et support ; `bed-ui.js` : document personnel et signature.                                                                      |
| HUD/banque           | `hud.js`, `equipment-controls.js`, `bank-ui.js` ; [véhicules et banque](vehicles-bank.md).                                                         |
| Mesure d’interaction | `interaction-timing.js` : feedback immédiat et traces bornées de sélection.                                                                        |
| Effets/son           | `insect-status.js`, `crash-effects.js`, `audio.js`, effets de combat et corps tombants du client.                                                  |

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

`live-hud.js` : valeurs au viseur et aide permanente ; `player-livery.js` : couleurs
et initiales corporelles. `salvos.js` : départs décalés et annulation d’occupation.
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
