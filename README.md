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
mais ne constituent pas une spécification exhaustive de l’état actuel.
Les notes dans `docs/archive/` sont historiques.

## Stack et démarrage

JavaScript ESM natif, Three.js embarqué dans `vendor/`, modèles procéduraux et
sons Web Audio. Le serveur Node utilise **uniquement la RAM**, sans base de
données. Les joueurs se connectent en étoile par WebRTC sur UDP : mouvements
sans retransmission, commandes importantes fiables avec confirmations.
Aucun WebSocket ni repli de gameplay HTTP/TCP. Un réseau sans UDP est refusé.
Le redémarrage du processus efface toutes les parties.

```sh
npm ci
npm start
```

Livraison courante : ZIP des sources, avec ce README et `package-lock.json`.
Le [guide Docker](docs/docker.md) reste disponible pour construire soi-même une image.

Node 22.13+ ; HTTP sur le port 3000, UDP sur 41000–41099. En production,
servir HTTP derrière HTTPS et exposer les ports UDP directement sur la VM.
Voir [le guide du serveur UDP](docs/udp-server.md) pour les variables et les tests.
`npm run dev` lance ce même serveur ; redémarrer après modification.

Le Site public existant reste sur son backend Worker/D1 historique, incapable
d'héberger ce processus UDP. `npm run dev:sites` permet de reproduire ce backend.
La bascule publique exige le déploiement du serveur Node sur une VM ; aucun
serveur ni domaine externe n'est provisionné par ce changement. Le serveur Node
n'importe pas le Worker ni son adaptateur SQLite. Les anciens tests D1 restent
pour vérifier la version historique pendant cette transition.

```sh
npm run format:check
npm test
npm run build
node scripts/validate-artifact.mjs
```

Modifier `src/` et `scripts/`, puis assembler. `worker/index.js` et `dist/` sont
générés. Les migrations publiées dans `drizzle/` restent immuables.

Le [backlog](BACKLOG.md) suit les tâches validées et leurs vérifications.

## Documents par besoin

| Besoin                                      | Référence actuelle                                            |
| ------------------------------------------- | ------------------------------------------------------------- |
| Règles et parcours joueur                   | [gameplay](docs/gameplay.md)                                  |
| Touches et capture du pointeur              | [controls](docs/controls.md)                                  |
| Modules, état réseau et responsabilités     | [code-structure](docs/code-structure.md)                      |
| Corps partagés et autorité client           | [walking-network](docs/walking-network.md)                    |
| File physique et combat chez Saint Pierre   | [purgatory-queue](docs/purgatory-queue.md)                    |
| Unités, flotte et DCA                       | [scale-fleet-weapons](docs/scale-fleet-weapons.md)            |
| Nuées, traceurs et accès aux équipements    | [swarm-equipment](docs/swarm-equipment.md)                    |
| Économie, signatures et balistique          | [economy-physics](docs/economy-physics.md)                    |
| Tests, publication et limites de validation | [operations](docs/operations.md)                              |
| Recherche initiale sur les transports       | [NETWORK-RESEARCH](NETWORK-RESEARCH.md) — contexte historique |

Les détails techniques renvoient aux sources externes pertinentes. Les constantes
et commandes exactes restent dans le code et `package.json`.

Les nouvelles règles de dégâts, mondes et contrats sont détaillées dans
[combat et mondes](docs/combat-worlds.md).

La courbe des vagues, récompenses et achats est décrite dans
[progression](docs/progression.md).

Les [retours de partie](docs/party-feedback.md) et le
[diagnostic du pistolet](docs/pistol-diagnosis.md) complètent les références actuelles.

L’identification des appareils, les annexes et les réserves partagées sont décrites
dans [logistique et contrats](docs/logistics-contracts.md).

Le lot [pilotage, véhicules et banque](docs/vehicles-bank.md) décrit Stuka, tank,
armes lourdes, accès par poste et prêts. Les interfaces HUD/banquier ont été validées et intégrées : informations au viseur et aide permanente,
jauge DCA au viseur, prêts et remboursements signés. Banquier : bouton ou N.
L’aperçu `/ui-review.html` utilise les composants réels avec des données temporaires.
Le lot [retours terrain](docs/field-update.md) décrit les accès corrigés, le pistolet
à l’épaule, les chutes, les lits, la lunette du tank, la minute de préparation et
les nouveaux taux de prêt. Les images Docker précédentes sont antérieures à ce lot.

Le lot [lisibilité, commandes, nettoyage et Spitfire](docs/clean-flight.md) ajoute
les bons prépayés et pose par E, les touches physiques de poste, les bombes en
continu, les projectiles teintés et la mire, les impacts uniques et le jet partagé.

Le [dernier lot multijoueur](docs/multiplayer-return.md) ajoute l’observation avant
purgatoire, l’aide permanente, les véhicules achetés à poser au sol, la réserve
gratuite au décollage, les fourmis précoces, la gravité miniature, le radar de 2 m
et les personnages identifiés. Le Spitfire a 1 000 balles ; les tirs sont optimisés.

Le lot [hélicoptère et DCA mobile](docs/support-vehicles.md) ajoute le H2 biplace
et le camion D2, avec roquettes, missile guidé et fusée de proximité. Le code et
les contrôles locaux sont livrés ; HEL-06/DCM-03 conservent leur validation finale
en cours, car le navigateur de contrôle ne peut pas joindre le jeu en UDP.

Le [correctif de visibilité des ennemis](docs/enemy-visibility.md) corrige les
aérations et transitions de vague, triple les moucherons et renforce les fourmis
de la première vague.

La [reprise du diagnostic de visibilité](docs/enemy-visibility.md#reprise-après-persistance-du-signalement--taille-apparente-des-six-espèces)
agrandit aussi les cinq autres espèces trop petites et ajuste l’appui au sol.

Le [lot confort de jeu, version 37](docs/comfort.md) précise réparation, zoom, jauges,
radar à pied, remise à zéro, fourmis et projectiles du pistolet courants.
