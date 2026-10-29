# Source map and checks

The browser uses native JavaScript modules. Keep generated Worker output out of
manual changes: `scripts/assemble.mjs` builds it from the asset manifest.

| File                                                   | Responsibility                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/client.js`                                        | Session flow, input bindings, UI, scene transitions and frame orchestration.      |
| `src/renderer.js`                                      | WebGL setup and software rendering fallback.                                      |
| `src/graphics.js`                                      | Shared materials, geometry helpers and existing character/aircraft/insect models. |
| `src/sortie.js`                                        | Landing contact, parachute descent, DCA stations and shared weapon tuning.        |
| `src/office.js`                                        | Static office, lights, furniture and its flight/camera colliders.                 |
| `src/layout.js`                                        | Shared world placement and base departure direction.                              |
| `src/base.js`                                          | Bays, world/deck conversion, parked/departure poses and boarding proximity.       |
| `src/purgatory-physics.js`                             | Client-owned bodies, collisions, health and cooperative state merging.            |
| `src/flight.js`, `src/mouse-flight.js`, `src/input.js` | Aircraft dynamics, mouse-flight decisions and controller input.                   |
| `src/control-focus.js`                                 | Pointer capture/release, logical keyboard mapping and flight input gating.        |
| `src/network.js`                                       | Peer motion transport and remote interpolation.                                   |
| `src/audio.js`                                         | Procedural spatial sound and its resource lifecycle.                              |
| `src/server.js`                                        | Session persistence, trusted body relay, documents and shared game rules.         |

Run `npm ci` to install the pinned formatting tool and `node-datachannel`
(native WebRTC binding for the Node UDP runtime). `npm run format` writes consistent formatting; `npm run format:check`
checks it. Generated output, dependencies and the vendored Three.js stay excluded.
`npm test` assembles the current source before testing, avoiding stale Worker code.
`npm run build` assembles and packages the deployable Worker.

Scene regression checks use actual Three.js geometry without needing WebGL:
fan foot/stand contact, landing gear/deck contact, outward aircraft heading and
velocity, the first twelve departure corridors and packaged scene modules.
The rest of the regression suite covers flight, controls, documents, multiplayer
state relay, audio and client-owned physical interactions.

The remaining client orchestration is intentionally retained. Extracting forms or
session state later should keep state ownership explicit instead of passing the
whole mutable client scope into another module.

## Scale and shared aircraft

`scale.js` owns map ratios and reference linear quantities; `layout.js` owns SI room placement and world placement helpers (current enemy routes are in `routes.js`). `fleet.js` owns aircraft specifications, pads, entry points and seat names. `combat.js` owns dispersion, fuse bounds, blast falloff, dive-siren intensity and bounded geometry effects. The client orchestrates these modules; the server persists the fleet and exclusive seats. See [scale-fleet-weapons.md](scale-fleet-weapons.md) for units, trust boundaries, countdown rules and tuning sources.

- `waves.js`: seeded difficulty budgets, typed rosters and deterministic flock flow.
- `tracers.js`: luminous streak geometry and disposal, separate from collision.
- See `swarm-equipment.md` for swarm and equipment contracts.

- `equipment.js`: shared catalog, profile upgrades and supported placement.
- `ballistics.js`: projectile drag/gravity and stable freefall/canopy integration.
- `routes.js`: seeded multi-source air and ground routes.
- `economy-physics.md`: revision 022 economy, latency and physics contracts.

## Node RAM runtime

- `server/game.js`: synchronous domain operations, rooms and authoritative rules in RAM.
- `server/session.js`: DTLS-bound player identity, command acknowledgements, bounded response cache and replay high-water mark.
- `server/index.js`: HTTP assets/offer exchange, native WebRTC, UDP-only ICE and room maintenance.
- `src/udp-client.js`: browser connection, strict UDP verification, pending commands and backpressure.
- `src/udp-protocol.js`: channel names, packet limits and reply chunk assembly.
- `worker/assets.js`: generated assets and collider data; contains no database code.

`npm start` uses this runtime. It shares pure gameplay modules with the browser;
no SQLite adapter or SQL compatibility layer is involved. See [UDP server](udp-server.md).

## Historical Sites state ownership and transport

The browser owns its aircraft and character movement. Other bodies are rendered
through RTC/HTTP interpolation, with cooperative local collision proxies. The
server owns membership, document progress, exclusive seats and persistent game
transactions. NPC physics is hosted by a player in purgatory, or advanced by the
server when no player is there. See [walking-network](walking-network.md).

Motion snapshots prefer a native unordered WebRTC data channel at 20 Hz. HTTP
carries signaling and persistent rules, and supplies fallback snapshots. The
server is a request-driven Worker using D1, not a continuously running room loop.
See [operations](operations.md) for transport and QA limitations.

`audio.js` synthesizes sounds with Web Audio and HRTF panners. `graphics.js`,
`office.js`, `sortie.js` and `combat.js` construct models and effects from geometry.
The project currently uses no imported model pack or recorded-sound pack.

## Livraison du backlog

`contracts.js` contient le catalogue préécrit et la sélection stable sans
répétition immédiate. `rewards.js` gère le compteur et la file des sonneries.
`combat.js` définit les impacts de DCA. Le serveur persiste PV/incarnations,
mondes et transferts atomiques dans la migration `0009_player_worlds.sql`.
Voir [combat et mondes](combat-worlds.md).

`insect-status.js` porte la taille spécifique du moucheron, les barres de PV et
les effets de blessure sans collision. Les reproductions de signature sont dans
`test-paper-feedback.mjs` ; `diagnose-pistol.mjs` exécute le pistolet inchangé
pour distinguer ses défauts de visée des chemins réseau.

`logistics.js` définit carburant, capacités par poste, service au sol, couverture
radar et angle d’or. `malice.js` porte les clauses compatibles et leurs facteurs.
`vehicle-livery.js` peint les meshes et gère les plaques d’équipage sans labels
flottants. `0011_logistics_contracts.sql` sépare réserves, débits idempotents et
dossiers des états de mouvement. `test-logistics-contracts.mjs` couvre le lot
avec les vrais modules, gestionnaire de déchirure et routes Worker. Voir
[logistique et contrats](logistics-contracts.md).

`aircraft-fire.js` porte la prédiction et le rapprochement des munitions d’avion.
`fire(vehicle, seat, supplies)` retourne immédiatement un booléen : le client
peut créer le projectile si une balle est disponible. `available()` fournit le
stock local restant pour le HUD et la cadence. Les identifiants sont regroupés
et transmis en arrière-plan ; `flush()` permet leur règlement anticipé.
`invalidate()` marque un changement d’occupation sans créer ou rejouer de tirs.
Les réponses ne possèdent aucune géométrie ni son : leur seule fonction est le
rapprochement des réserves. Les tests `test-aircraft-fire.mjs` exercent le module
et le vrai point d’entrée client en retenant volontairement les réponses HTTP.
Voir [logistique et contrats](logistics-contracts.md) pour les limites et reprises.

## Pilotage, véhicules et banque en RAM

- `armament.js`, `ordnance.js` : profils et trajectoires des armes lourdes, contacts et stocks.
- `tank.js` : conduite sur supports, collision, chute et neutralisation sans pilote.
- `equipment-controls.js` : zoom maintenu et touches contextuelles.
- `bank.js` : offres et amortissements en centimes, échéances et remboursement anticipé.
- `route-navigation.js`, `route-obstacles.js` : chemins praticables et obstacles générés.
- `route-speed.js` : calibration de la vitesse effective des anciennes routes.
- `crash-effects.js` : copies visuelles, phase horodatée et nettoyage borné.
- `docs/ui-review.html` : maquette autonome des écrans en attente de confirmation.

`server/game.js` applique ces règles dans le runtime Node. Les opérations d’armes
lourdes sont validées et simulées côté serveur ; les MG restent prédites. Voir
[véhicules et banque](vehicles-bank.md) pour les limites et `test-next-backlog.mjs`.

`hud.js` produit les valeurs propres à chaque poste et gère l’ouverture temporaire
des rails. `bank-ui.js` possède le panneau, les documents, signatures et l’attente
des confirmations ; il utilise le domaine `bank.js` par les commandes UDP du client.
`scripts/build-ui-preview.mjs` génère `docs/ui-review.html` depuis le HTML réel
et ces mêmes modules, sur une caisse de démonstration sans réseau.
