# i am a moucheron

Jeu coopératif multijoueur de combat aérien miniature dans un bureau. Les joueurs
courent entre les appareils, signent leur paperasse, défendent la poubelle contre
des vagues d’insectes et passent chez Saint Pierre après leur mort.

## Reprendre le projet

1. [AGENTS.md](AGENTS.md) : règles de travail (agents et humains).
2. [CONTRIBUTING.md](CONTRIBUTING.md) : parcours d'une contribution sur GitHub.
3. [Gameplay](docs/gameplay.md), [carte du code](docs/code-structure.md) et
   [exploitation](docs/operations.md) selon la tâche.

Les tâches ouvertes vivent dans les issues GitHub ; l’historique est dans Git. Le dépôt
est la référence : en cas d'écart, le code fait foi.

## Stack et démarrage

ESM natif sans bundler, en migration vers TypeScript à types effacés
([fonctionnement](docs/typescript.md)) ; Three.js r187 (WebGPU) embarqué dans `vendor/` ;
physique Rapier ; modèles procéduraux et Meshy embarqués ; décor du Cartoon Office Pack de
BloxBits (acheté, réservé à ce jeu : [licence](src/office-pack-LICENSE.md)) ; sons Web
Audio. Le serveur Node garde tout **en RAM**, sans base de données : un redémarrage efface
les parties. Les joueurs se connectent en étoile par WebRTC sur UDP (mouvements sans
retransmission, commandes importantes fiables) ; un réseau sans UDP joue en TCP sur un
WebSocket, avec le même protocole. Aucun gameplay ne passe en HTTP.

```sh
npm ci
npm start   # Node 22.18+ ; HTTP sur le port 3000, UDP sur 41000–41099
npm test    # suite complète (inclut tsc, format:check et les liens Markdown)
```

Variables et déploiement réseau : [serveur et transport](docs/udp-server.md). Contrôles,
CI et déploiement automatique depuis `main` : [exploitation](docs/operations.md).

## Documentation

Elle se lit aussi sur le site <https://simonjamain.github.io/i-am-a-moucheron/>, généré
depuis ce dépôt ([fonctionnement](docs/site.md)). Les constantes et commandes exactes
restent dans le code et `package.json`.

**Jeu** — [gameplay](docs/gameplay.md) · [commandes](docs/controls.md) ·
[vagues, puissance et magasin](docs/progression.md) · [bestiaire](docs/enemy-bestiary.md) ·
[nuées](docs/dense-swarms.md) · [plans de bureau](docs/office-layouts.md)

**Règles détaillées** — [caisse, achats et services](docs/economy.md) · [banque](docs/bank.md) ·
[dossiers, réserves et livraisons](docs/logistics-contracts.md) ·
[combat, PV et sièges](docs/combat-worlds.md) · [flotte, échelle et armement](docs/scale-fleet-weapons.md) ·
[H2 et DCA mobile](docs/support-vehicles.md) · [tourelle Gatling](docs/gatling-turret.md) ·
[projectiles](docs/projectiles.md) · [statistiques](docs/stats.md) ·
purgatoire ([file](docs/purgatory-queue.md), [ciel](docs/purgatory-sky.md), [décor](docs/purgatory-scene.md)) ·
[mode debug](docs/laboratory.md)

**Architecture** — [carte du code](docs/code-structure.md) · [confiance envers les clients](docs/trust-model.md) ·
[autorité et corps partagés](docs/walking-network.md) · [serveur et transport](docs/udp-server.md) ·
physique ([Rapier](docs/physics-engine.md), [avions](docs/plane-physics.md),
[hélicoptères](docs/heli-physics.md), [rubans d'air](docs/air-ribbons.md),
[collisions](docs/collisions.md), [affichage debug](docs/physics-debug.md)) ·
[performances](docs/performance.md) · [TypeScript](docs/typescript.md) ·
[ajouter du contenu](docs/adding-content.md)

**Rendu, son et modèles** — [direction artistique](docs/art-direction.md) ·
[règles d’interface](docs/ui-guidelines.md) · [écran de chargement](docs/loading-screen.md) ·
[rendu dessin animé](docs/toon-rendering.md) · [WebGPU](docs/webgpu.md) ·
[éclairage et ombres](docs/office-lighting.md) · [audio](docs/audio.md) ·
[pipeline des assets 3D](docs/asset-pipeline.md) · [catalogue des modèles](docs/models.md)

**Contribution** — [exploitation et vérifications](docs/operations.md) · [Docker](docs/docker.md) ·
[version et nouveautés](docs/changelog.md) · [site](docs/site.md) ·
[notes de reprise](docs/tasks/README.md) (en cours : [migration TypeScript](docs/tasks/typescript-migration.md))
