# Carte du code

Client Three.js (WebGPU, repli WebGL 2) et serveur Node en RAM, en ESM natif sans
bundler ; les modules migrent vers TypeScript à types effaçables
([TypeScript](typescript.md)). Les types partagés sont dans `src/types.ts`. Un
module de `src/` importé par `server/` est une règle partagée : client et serveur
calculent la même chose. Lire ensuite la référence métier liée à chaque domaine ;
pour lancer et tester : [exploitation](operations.md).

## Autorité

| Qui                  | Possède                                                                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigateur du joueur | Sa physique (corps, engin piloté), ses visées, ses tirs (prédits, débités par lots) et les impacts qu'il déclare, y compris ceux des armes lourdes qu'il simule (`heavy-sim.ts`). Le joueur désigné simule les PNJ du purgatoire.                                      |
| Serveur (`server/`)  | Règles partagées : salles, vagues, sièges, argent, achats, contrats, signatures, stocks et munitions, dégâts appliqués, réapparition. Il simule aussi les insectes au sol, les tourelles automatiques, les engins sans pilote (`parked-host.ts`) et les PNJ sans hôte. |
| Aucun anti-triche    | Voir [confiance envers les clients](trust-model.md).                                                                                                                                                                                                                   |

Détails : [autorité et corps partagés](walking-network.md), [transport](udp-server.md).
Le serveur n'a ni base de données ni accès disque en jeu (seules les
[statistiques](stats.md) sont écrites périodiquement).

## Serveur et réseau

| Module                                               | Rôle                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `server/index.js`                                    | HTTP (assets, `/healthz`, `/stats`), négociation WebRTC `/rtc/offer`, secours WebSocket `/ws`, lots de mouvements, tick de 250 ms. |
| `server/session.ts`                                  | Une connexion : identité, commandes fiables idempotentes, cadence, réponses encodées, mouvements reçus.                            |
| `server/game.js`                                     | Domaine en RAM : salles, joueurs, vagues, sièges, achats, dégâts, réserves, insectes au sol, tourelles, PNJ.                       |
| `server/wave-preparation.ts`                         | Budget et tirage de la vague annoncée ([puissance](progression.md)).                                                               |
| `server/stats.ts`, `server/stats-page.ts`            | [Statistiques](stats.md) d'équipements, `/stats` et `/stats.json`.                                                                 |
| `src/udp-protocol.ts`, `src/udp-client.ts`           | Canaux, limites, découpage et réassemblage des réponses ; client WebRTC du navigateur.                                             |
| `src/ws-client.ts`                                   | Secours TCP : même interface que `UdpClient` sur un WebSocket.                                                                     |
| `src/motion-wire.ts`                                 | Codec binaire des mouvements et lots partagés.                                                                                     |
| `src/snapshot-wire.ts`                               | Roster compact, deltas de morts/dégâts et patchs `$patch` des réponses fiables.                                                    |
| `src/network.ts`                                     | `validMotion`, `MotionTrack` (interpolation des pairs) ; `PeerMotion` hors serveur UDP.                                            |
| `src/server-clock.ts`, `src/ground-motion.ts`        | Horloge serveur lissée ; interpolation des insectes au sol reçus.                                                                  |
| `scripts/assemble.mjs` → `server/assets.js` (généré) | Assets à URL de contenu, colliders, graphe d'imports ; `dist/` est la sortie autonome.                                             |

## Client : boucle, rendu, interface

| Domaine           | Modules                                                                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Démarrage, boucle | `boot.ts` (écran de chargement, puis graphe du jeu), `client.js` (orchestration : scène, état local, entrées, pas fixe de 1/120 s, commandes), `render-interpolation.ts`, `pose-smoother.ts`, `camera-follow.ts`, `camera-clearance.ts`.                                      |
| Rendu             | `renderer.ts` ([WebGPU](webgpu.md)), `gpu-passes.ts`, `post-highlight.ts`, `shadow-settings.ts`, `render-info.ts`, `fps-counter.ts`, `graphics.ts` (modèles et assemblage).                                                                                                   |
| Bureau            | `layouts.ts` / `layout.ts` ([plans](office-layouts.md)), `office.ts`, `office-props.ts`, `office-pack*.ts`, `office-lights.ts` ([éclairage](office-lighting.md)), `office-fog.ts`, `office-collision.ts` / `oriented-collider.ts` ([collisions](collisions.md)).              |
| Échelle, unités   | `scale.ts` ([échelle](scale-fleet-weapons.md)), `units.ts` (affichage des distances).                                                                                                                                                                                         |
| Interface         | `hud.ts`, `live-hud.ts`, `reload-hud.ts`, `reserve-feedback.ts`, `equipment-controls.ts`, `control-focus.ts`, `interaction-timing.ts`, `appearance-picker.ts`, `changelog.ts` / `changelog-history.ts` ([nouveautés](changelog.md)) ; [règles d'interface](ui-guidelines.md). |
| Documents papier  | `paper-form.ts`, `bed-ui.ts`, `purchase-ui.ts`, `upgrade-ui.ts`, `vip-pass-ui.ts`, `bank-ui.ts`, `wave-council-ui.ts`.                                                                                                                                                        |
| Son               | `audio/` (bibliothèque sans dépendance au jeu), `game-audio/` (catalogue, synthèse, priorités, nuées) ; [audio](audio.md).                                                                                                                                                    |
| Mode debug        | `lab-ui.ts` ([laboratoire](laboratory.md)), `debug-enemies.ts`, `debug-tools.ts`, `physics-debug.ts` ([affichage de la physique](physics-debug.md)).                                                                                                                          |

## Corps, mondes et physique

| Domaine          | Modules                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marche et mondes | `walk-arena.ts` (moteur commun), `base.ts` (bureau), `purgatory-queue.ts` (file, guichet, VIP), `arena-frame.ts`, `sortie.ts` (`stepWalker`, atterrissage, stations), `walker-world.ts` (contrôleur de personnage Rapier), `field-physics.ts` (gravité, chute, impact), `exit-spot.ts` (point de sortie d'un engin) ; [corps partagés](walking-network.md). |
| Purgatoire       | `purgatory-scene.ts`, `purgatory-clouds.ts`, `cloud-nodes.ts`, `sky-passage.ts`, `sky-targets.ts` ; [décor](purgatory-scene.md), [ciel](purgatory-sky.md).                                                                                                                                                                                                  |
| Personnages      | `character-appearances.ts` (validé aussi par le serveur), `character-model.ts`, `walker-air-pose.ts`, `saint-pierre-model.ts`, `vip-guard-model.ts`, `clipboard-model.ts`.                                                                                                                                                                                  |
| Moteur Rapier    | `physics-world.ts`, `solid-query.ts` (requêtes), `walker-world.ts` (marche), `castor-physics.ts`, `tank-physics.ts`, `truck-physics.ts`, `plane-physics.ts`, `heli-physics.ts`, `parked-host.ts` ; [physique Rapier](physics-engine.md).                                                                                                                    |
| Vol              | `flight.ts`, `mouse-flight.ts`, `flight-tuning.ts` / `flight-tuning-ui.ts` ([réglages](controls.md#réglages-personnels-des-avions)), `helicopter.ts` (visée du copilote, pas d'avant Rapier), `air-ribbons.ts`, `aircraft-geometry.ts`.                                                                                                                     |

## Engins et armes

| Domaine            | Modules                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flotte             | `fleet.ts` (profils, sièges, `VEHICLES`), `seat-posts.ts` (postes visables, partagé), `vehicle-anchors.ts` (généré : pivots, bouches, enveloppes), `vehicle-livery.ts`, `vehicle-care.ts` ; [ajouter du contenu](adding-content.md).                                    |
| Modèles d'engins   | `meshy-rig.ts`, `meshy-texture.ts`, `*-model.ts` (`biplane`, `m1`, `b3`, `h2`, `castor`, `flying-castor`), `aircraft-wheels.ts`, `castor-wheels.ts`, `tank-gear.ts`, `track-suspension.ts`, `tessellate.ts`, `tank-recoil.ts`, `engine-smoke.ts`, `missile-exhaust.ts`. |
| Tir et projectiles | `projectiles.ts` ([projectiles](projectiles.md)), `materials.ts`, `ricochet.ts`, `ballistics.ts`, `combat.ts`, `armament.ts`, `aircraft-fire.ts`, `salvos.ts`, `remote-rounds.ts`, `muzzle.ts`, `hull-gun.ts`.                                                          |
| Armes lourdes      | `heavy-sim.ts` (simulées par le tireur), `ordnance.ts`, `swept-geometry.ts`, `mobile-flak.ts` (camion DCA), `fixed-dca.ts` / `fixed-dca-model.ts`.                                                                                                                      |
| Visée, caméras     | `personal-aim.ts`, `tank-view.ts`, `tank-reticle.ts`, `castor-top-view.ts`.                                                                                                                                                                                             |
| Effets             | `tracers.ts`, `blood-effects.ts`, `crash-effects.ts`, `insect-status.ts` (présentation seule).                                                                                                                                                                          |

## Ennemis et vagues

| Domaine           | Modules                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Espèces et vagues | `waves.ts` (profils, trajectoires de nuée), `routes.ts`, `route-navigation.ts`, `enemy-power.ts`, `balance.ts` ; [bestiaire](enemy-bestiary.md), [puissance](progression.md).                                            |
| Touches           | `insect-hitboxes.ts` (volumes de tir des insectes dans Rapier), `insect-hits.ts` (cibles solides), `swept-broadphase.ts` (contacts véhicule–ennemi du serveur) ; [performances](performance.md).                         |
| Au sol            | `ground-crowd.ts` (sous-pas, voisinage), `ground-creatures.ts` (navigation, pièges), `pheromone-trail.ts`, `wave-forecast-scene.ts`, `wave-ground-paths.ts`, `wave-ground-worker.ts` (chemins annoncés, dans un worker). |
| Rendu des espèces | `rigged-creature.ts`, `midge-batch.ts`, `flyer-batch.ts`, `walker-batch.ts`, `creature-batch.ts`, `walker-gait.ts`, `*-model.ts` par espèce ([pipeline d'assets](asset-pipeline.md)).                                    |

## Économie, constructions, logistique

| Domaine              | Modules                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Argent et achats     | `equipment.ts` (boutique, pose), `shop-catalog.ts`, `shop-thumbs.ts`, `bank.ts`, `rewards.ts`, `contracts.ts` ; [économie](economy.md), [banque](bank.md).                                                                                                                     |
| Réserves et services | `logistics.ts`, `paid-service.ts`, `service-zones.ts`, `ground-ammo.ts`, `station-model.ts`, `delivery.ts`, `airdrop.ts` ; [logistique](logistics-contracts.md).                                                                                                               |
| Lits                 | `beds.ts`, `bed-model.ts`, `bed-ui.ts`.                                                                                                                                                                                                                                        |
| Défenses au sol      | `ground-defense.ts`, `ground-defense-state.ts` (placement et collisions, partagé), `ground-placement.ts`, `placement-aim.ts`, `ground-defense-ui.ts`, `ground-model.ts`, `model-preview.ts`, `brick-rules.ts` / `brick-wall.ts` ; [gameplay](gameplay.md#défenses-terrestres). |
| Tourelles et postes  | `ground-sentry.ts` (tir serveur), `sentry-model.ts`, `gatling-model.ts`, `ground-fortifications.ts`, `fortification-model.ts`, `howitzer-model.ts`, `howitzer-geometry.ts` ; [Gatling](gatling-turret.md).                                                                     |

## Scripts

Les commandes courantes sont celles de `package.json` ; les tests sont listés dans
`scripts/suite.mjs` (lancés par `scripts/run-tests.mjs`), les scénarios navigateur
dans sa liste `E2E` ; `scripts/smoke-image.ts` joue une partie UDP contre l'image Docker
démarrée ([Docker](docker.md#contrôle-de-contribution-et-protection-de-main)). Les importeurs d'assets (`scripts/import-*.py`,
`split-vehicle-parts.mjs`, `rig-*.mjs`, `measure-aircraft.mjs`) génèrent les modules
`src/*-data.ts` et `src/vehicle-anchors.ts` ([pipeline d'assets](asset-pipeline.md)).
`scripts/build-ui-preview.mjs` produit `/ui-review.html` ; `scripts/check-docs.mjs`
contrôle les liens de la documentation.
