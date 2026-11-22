# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 (routine) ;
  PR [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204) (fondations).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement de jeu, URL servies, image
  Docker inchangé. Règles : [TypeScript](../typescript.md).

## État réel (v378)

- Outillage en place : `tsconfig.json`, `npm run typecheck`, `npm run ts:migrate`,
  lecture `.ts` et effacement des types dans `scripts/assemble.mjs`, garde
  `scripts/test-typescript.mjs`, types partagés `src/types.ts`, lanceur
  `scripts/run-tests.mjs` + manifeste `scripts/suite.mjs`.
- Migrés : 93 modules de `src/` (liste : `ls src/*.ts`), `server/stats.ts`,
  `server/stats-page.ts`, `scripts/audio-library-types.ts`.
- Lot 4 (v378) : 32 feuilles du graphe d'imports.
  - Réseau et domaine : `network`, `layouts` (`FurnitureKind` dérivé des clés de la
    table), `logistics`, `delivery`, `sortie`, `beds`, `shop-catalog`,
    `equipment-controls`, `boot`.
  - Collisions et créatures : `insect-hits`, `purgatory-physics`, `creature-batch`,
    `pheromone-trail`.
  - Effets : `blood-effects`, `engine-smoke`, `tracers`, `missile-exhaust`,
    `crash-effects`.
  - Rendu et modèles : `toon`, `renderer`, `model-preview`, `howitzer-model`,
    `fixed-dca-model`, `castor-top-view`, `sentry-model`, `meshy-rig`, `office-fog`,
    `station-model`, `castor-model`, `brick-wall`, `flying-castor-model`, `bed-model`.
  - Contrôle d'équivalence : chaque module, une fois ses types effacés et passé à
    Prettier, a été comparé à l'ancien `.js`. Seuls diffèrent les déclarations de
    champs de classe, des alias locaux (`const PROFILES = VEHICLES`) et des
    paramètres renommés dans des rappels `traverse`.
  - `boot.ts` importe des URL réservées au navigateur (`/three.js`, `/client.js`)
    sous `// @ts-expect-error`. `scripts/test-loading-exit.mjs` efface désormais les
    types avant d'exécuter `boot.ts`.
- Restent écrits à la main : 104 `.js` dans `src/` (dont `client.js`, ≈ 6 800
  lignes, `contracts.ts`, `waves.js`, `changelog.ts` et les données générées),
  `server/*.js` et les `scripts/*.mjs`. `npm run ts:migrate -- --leaves` donne la
  liste des modules prêts.
- Hors de cet environnement : partie WebGL réelle et pilotage humain. Le test
  `npm run e2e:layouts` échoue aussi sur `main` non modifié (délai dépassé à
  « Connexion au salon… ») : c'est un défaut d'environnement, pas une régression.

## Décision en attente (utilisateur)

**Données générées `src/*-data.js`** (Meshy, personnages) : proposition — faire
émettre `.ts` par les générateurs, sans annotations, exclus de `tsc` si la
vérification devient lente.

## Ordre conseillé

1. Feuilles du graphe d'imports : `npm run ts:migrate -- --leaves` (liste à jour ;
   `vehicle-anchors.js` est généré par `import-meshy-vehicle.py`, voir la décision).
2. Protocole : `udp-client`, `ws-client` (`network` fait).
3. Domaine : `routes`, `waves` (puis dériver `EnemyType` de
   `keyof typeof ENEMY_TYPES` et retirer la copie de `src/types.ts`), `contracts`
   (`layouts` et `logistics` faits).
4. Serveur : `server/wave-preparation`, `session`, `game`, `index`.
5. Rendu/UI puis `client.js` (extraire des modules avant de migrer).
6. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

Vérifier à chaque lot : `npm run typecheck`, `npm test`, `npm run format:check`,
`npm run check:docs` ; `npm run test:udp` et `npm run e2e` pour le protocole.
