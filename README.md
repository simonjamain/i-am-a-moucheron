# i am a moucheron

Jeu coopératif multijoueur de combat aérien miniature dans un bureau. Les joueurs
courent entre les appareils, signent leur paperasse, défendent la poubelle contre
des vagues d’insectes et passent chez Saint Pierre après leur mort.

## Reprendre le projet

1. Lire [AGENTS.md](AGENTS.md) pour les règles de travail et d’entretien.
2. Lire [le gameplay actuel](docs/gameplay.md) pour les interactions.
3. Consulter [la carte du code](docs/code-structure.md) et
   [l’exploitation](docs/operations.md) selon la tâche.

Le dépôt est la référence maintenue. Les conversations expliquent les demandes,
mais ne constituent pas une spécification exhaustive de l’état actuel. Les tâches
ouvertes vivent dans les issues GitHub ; l’historique est dans Git.

## Contributions

Le développement collaboratif passe par GitHub :
[contribuer](CONTRIBUTING.md), proposer une PR et
[transmettre une tâche](docs/tasks/README.md). Les environnements temporaires
par PR restent à configurer ; voir CONTRIBUTING pour leur état et la cible.

## Stack et démarrage

ESM natif en migration vers TypeScript ([fonctionnement](docs/typescript.md)), Three.js embarqué dans `vendor/`, modèles procéduraux et Meshy embarqués, décor du
bureau issu du Cartoon Office Pack de BloxBits (acheté, réservé à ce jeu : [licence](src/office-pack-LICENSE.md)), et
sons Web Audio. Le serveur Node utilise **uniquement la RAM**, sans base de
données. Les joueurs se connectent en étoile par WebRTC sur UDP : mouvements
sans retransmission, commandes importantes fiables avec confirmations.
Un réseau sans UDP (réseau d'entreprise) joue en TCP sur un WebSocket, avec le
même protocole ; aucun gameplay ne passe en HTTP.
Le redémarrage du processus efface toutes les parties.

```sh
npm ci
npm start
```

Livraison : PR GitHub fusionnée sur `main`. Chaque commit sur `main` publie l’image
`latest` sur GHCR ; un environnement extérieur au dépôt la récupère périodiquement
et la déploie sur le VPS. Le [guide Docker](docs/docker.md) décrit la construction locale.

Node 22.18+ ; HTTP sur le port 3000, UDP sur 41000–41099. En production,
servir HTTP derrière HTTPS et exposer les ports UDP directement sur la VM.
Voir [le guide du serveur UDP](docs/udp-server.md) pour les variables et les tests.
`npm run dev` lance ce même serveur ; redémarrer après modification.

Le serveur Node/UDP est l'unique runtime du jeu.

```sh
npm run format:check
npm test
npm run build
node scripts/validate-artifact.mjs
```

Modifier `src/` et `scripts/`, puis assembler. `server/assets.js`, `VERSION`, `src/changelog-recent.ts` et `dist/` (tous ignorés par Git) sont
générés ([version et nouveautés](docs/changelog.md)).
`npm run build` produit un runtime Node autonome dans `dist/` : y exécuter
`npm ci --omit=dev && npm start`. Le validateur contrôle ce paquet Node.

## Documents par thème

La documentation se lit aussi sur le site <https://simonjamain.github.io/i-am-a-moucheron/>,
généré depuis ce dépôt ([fonctionnement](docs/site.md)) : menus par public, recherche,
nouveautés, galerie visuelle, écrans intégrés et santé de la documentation.

Les constantes et commandes exactes restent dans le code et `package.json`. Les
documents marqués _(lot)_ racontent une livraison datée : ils décrivent des
comportements encore valides mais peuvent citer des versions ou des états
dépassés ; en cas de doute, le code et les références du thème font foi.

**Jeu et règles**

- [gameplay](docs/gameplay.md) : règles et parcours joueur · [controls](docs/controls.md) : touches, pointeur · [comfort](docs/comfort.md), [clean-flight](docs/clean-flight.md), [field-update](docs/field-update.md), [multiplayer-return](docs/multiplayer-return.md) _(lots)_
- [progression](docs/progression.md) : vagues, récompenses, achats · [enemy-power](docs/enemy-power.md) : puissance et budget · [economy-physics](docs/economy-physics.md) : économie, signatures, balistique · [stats](docs/stats.md) : statistiques des équipements
- [combat-worlds](docs/combat-worlds.md) · [logistics-contracts](docs/logistics-contracts.md) · [purgatory-queue](docs/purgatory-queue.md) · [laboratory](docs/laboratory.md) (mode debug) · [office-layouts](docs/office-layouts.md)

**Ennemis**

- [enemy-bestiary](docs/enemy-bestiary.md) · [enemy-visibility](docs/enemy-visibility.md) · [dense-swarms](docs/dense-swarms.md) · [swarm-equipment](docs/swarm-equipment.md)

**Véhicules et armes**

- [scale-fleet-weapons](docs/scale-fleet-weapons.md) : unités, flotte, DCA · [vehicles-bank](docs/vehicles-bank.md) : Stuka, tank, banque · [support-vehicles](docs/support-vehicles.md) : H2 et camion D2 · [helicopter-controls](docs/helicopter-controls.md) · [biplane-models](docs/biplane-models.md) · [physics-engine](docs/physics-engine.md) : Rapier

**Architecture et réseau**

- [trust-model](docs/trust-model.md) : confiance envers les clients, pas d'anti-triche
- [code-structure](docs/code-structure.md) : carte du code · [walking-network](docs/walking-network.md) : corps partagés, autorité client · [udp-server](docs/udp-server.md) : serveur, variables, tests · [performance](docs/performance.md) : mesures et optimisations · [typescript](docs/typescript.md) · [adding-content](docs/adding-content.md) : nouvelle espèce ou nouveau véhicule

**Rendu, son et modèles**

- [art-direction](docs/art-direction.md) : direction artistique · [ui-guidelines](docs/ui-guidelines.md) : règles d’interface · [audio](docs/audio.md) · [toon-rendering](docs/toon-rendering.md) · [shadow-visibility](docs/shadow-visibility.md) · [asset-pipeline](docs/asset-pipeline.md) : modèles Meshy et outil GLB · [meshy-fleet](docs/meshy-fleet.md), [b3-model](docs/b3-model.md), [h2-model](docs/h2-model.md), [m1-model](docs/m1-model.md), [t01-asset](docs/t01-asset.md), [gatling-turret](docs/gatling-turret.md)

**Exploitation et contribution**

- [operations](docs/operations.md) : contrôles, tests, limites de validation · [docker](docs/docker.md) · [CONTRIBUTING](CONTRIBUTING.md) · [notes de reprise](docs/tasks/README.md) (en cours : [migration TypeScript](docs/tasks/typescript-migration.md), [montée en charge](docs/tasks/scaling-plan.md))

`/ui-review.html` (aperçu des vrais composants HUD/banque sur données temporaires, publié aussi sur le site : [écrans intégrés](https://simonjamain.github.io/i-am-a-moucheron/ecrans/))
est généré par l’assemblage (`scripts/assemble.mjs`, lancé par `npm start`, `npm test` et `npm run build`).

## Outillage de modèles Meshy

[Optimisation géométrique GLB gratuite, Docker Compose et CI](docs/asset-pipeline.md) :
un outil **de développement** ponctuel séparé du serveur de jeu, qui conserve
UV, textures et pièces protégées. Les fichiers monoblocs nécessitent d'abord
une séparation des pièces mobiles ; aucune conversion automatique de la flotte.
