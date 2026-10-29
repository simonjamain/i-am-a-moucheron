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

| Domaine              | Modules et référence                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unités/décor         | `scale.js`, `layout.js`, `office.js` ; [échelle](scale-fleet-weapons.md).                                         |
| Géométrie            | `graphics.js`, modèles procéduraux ; `renderer.js` pour WebGL/secours.                                            |
| Vol et entrée        | `flight.js`, `mouse-flight.js`, `input.js`, `control-focus.js`, `fleet.js`, `vacant-flight.js`.                   |
| Corps et purgatoire  | `base.js`, `purgatory-physics.js`, `sortie.js` ; [file](purgatory-queue.md).                                      |
| Chute actuelle       | `field-physics.js` : mètres du décor, gonflage, vitesse verticale et dégâts ; [retours terrain](field-update.md). |
| Armes                | `ballistics.js`, `combat.js`, `armament.js`, `ordnance.js`, `aircraft-fire.js`, `tracers.js`, `insect-hits.js`.   |
| Visée/caméras        | `personal-aim.js` pour épaule/main ; `tank-view.js` pour lunette, observation et bouche serveur.                  |
| Vagues               | `waves.js`, `routes.js`, `route-speed.js`, `route-navigation.js`, `route-obstacles.js` généré.                    |
| Économie/réserves    | `equipment.js`, `logistics.js`, `bank.js`, `rewards.js` ; [logistique](logistics-contracts.md).                   |
| Contrats             | `contracts.js`, `malice.js`, gestion des papiers dans le client.                                                  |
| Lits                 | `beds.js` : accès et support ; `bed-ui.js` : document personnel et signature.                                     |
| HUD/banque           | `hud.js`, `equipment-controls.js`, `bank-ui.js` ; [véhicules et banque](vehicles-bank.md).                        |
| Mesure d’interaction | `interaction-timing.js` : feedback immédiat et traces bornées de sélection.                                       |
| Effets/son           | `insect-status.js`, `crash-effects.js`, `audio.js`, effets de combat et corps tombants du client.                 |

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
