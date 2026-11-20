# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 (routine) ;
  PR [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204) (fondations).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement de jeu, URL servies, image
  Docker inchangé. Règles : [TypeScript](../typescript.md).

## État réel (v366)

- Outillage en place : `tsconfig.json`, `npm run typecheck`, `npm run ts:migrate`,
  lecture `.ts` et effacement des types dans `scripts/assemble.mjs`, garde
  `scripts/test-typescript.mjs`, types partagés `src/types.ts`, lanceur
  `scripts/run-tests.mjs` + manifeste `scripts/suite.mjs`.
- Migrés : 39 modules de `src/` (liste : `ls src/*.ts`), `server/stats.ts`,
  `server/stats-page.ts`, `scripts/audio-library-types.ts`. Restent écrits à la main :
  154 `.js` dans `src/` (dont `client.js`, ≈ 6 800 lignes), `server/*.js` et les
  `scripts/*.mjs`.
- Non effectué : `docker build` local (Docker indisponible), partie WebGL réelle,
  pilotage humain.

## Décision en attente (utilisateur)

**Données générées `src/*-data.js`** (Meshy, personnages) : proposition — faire
émettre `.ts` par les générateurs, sans annotations, exclus de `tsc` si la
vérification devient lente.

## Ordre conseillé

1. Feuilles du graphe d'imports : `npm run ts:migrate -- --leaves` (liste à jour).
2. Protocole : `udp-protocol`, `udp-client`, `ws-client`, `network`.
3. Domaine : `layouts`, `routes`, `waves` (puis dériver `EnemyType` de
   `keyof typeof ENEMY_TYPES` et retirer la copie de `src/types.ts`), `equipment`,
   `logistics`, `contracts`, `armament`.
4. Serveur : `server/wave-preparation`, `session`, `game`, `index`.
5. Rendu/UI puis `client.js` (extraire des modules avant de migrer).
6. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

Vérifier à chaque lot : `npm run typecheck`, `npm test`, `npm run format:check`,
`npm run check:docs` ; `npm run test:udp` et `npm run e2e` pour le protocole.
