# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 ; fondations
  [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204), derniers lots #336 et #338.
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement, URL servies et image Docker
  inchangés. Règles et pièges : [TypeScript](../typescript.md).

## État réel (main, 23 novembre 2026)

- Outillage complet (`tsconfig.json`, `typecheck`, `ts:migrate`, garde
  `test-typescript.mjs`, types partagés `src/types.ts`). Données générées en `.ts`
  ([décision](../typescript.md#données-générées)).
- Restent en `.js` : 25 modules de `src/` (dont `client.js`, ≈ 7 000 lignes,
  `waves.js`, `graphics.js`, `hud.js`), `server/game.js`, `server/index.js`,
  `server/wave-preparation.js` et les `scripts/*.mjs`. Liste exacte : `ls src/*.js server/*.js`.
- `npm run ts:migrate -- --leaves` liste 10 feuilles prêtes : `waves`, `route-speed`,
  `wave-ground-paths`, `midge-batch`, `flyer-batch`, `walker-batch`, `ground-placement`,
  `ground-creatures`, `helicopter`, `wave-forecast-scene`.

## Défauts révélés par le typage, non corrigés

À traiter chacun à part, avec test de régression :

- `PurchaseUI.open(item)` ne respecte pas la signature de `BedUI.open(bed)`
  (`@ts-expect-error` commenté : composer plutôt qu'hériter).
- `GaitHelpers.lowest` renvoie `Vector3` alors que `CreatureHelpers.lowest` peut
  renvoyer `null` (`walkLegs` planterait sans os d'extrémité).
- `splitBarricade` renvoie `number[]` là où les murs attendent `Vec2`.
- `ground-model.ts` : la dernière branche calcule `intact` pour une barricade déjà
  traitée plus haut ; la couleur « détruit » (`#574637`) n'apparaît jamais.
- `scripts/review-shadows.html` importe `../src/*.js` alors que ces modules sont en
  `.ts` : l'outil ne fonctionne plus sans l'assembleur.

## Types à centraliser

- `WalkerHelpers` (répété dans quatre modèles) → `walker-gait.ts`.
- `GroundStructure` / `GroundCommand` (`ground-defense-state.ts`) pour `server/game.js`,
  `ground-placement.js`, `ground-defense-ui.js` ; `RouteEnemy` (`routes.ts`) pour `waves.js`.
- `MidgeRig` (même forme que `LoadingFly` de `boot.ts`), `GroundModelStructure`,
  `ServicedVehicle`.
- Vers `src/types.ts` : `StatusError` (`Error & { status?: number }`, défini deux fois),
  `Timer`, `SessionPlayer` (pour `server/index.js`), le véhicule « type + supplies »
  (`HudVehicle`, `ReserveVehicle`), l'epoch de base des instantanés (`BankSnapshot`,
  `BedSnapshot`).

## Prochaine action

1. Migrer les 10 feuilles, en commençant par `waves` : dériver alors `EnemyType` de
   `keyof typeof ENEMY_TYPES`, retirer sa copie de `src/types.ts` et typer les ennemis
   avec `RouteEnemy`.
2. Serveur : `server/wave-preparation`, `game`, `index` ; regrouper les types ci-dessus.
3. Rendu/UI puis `client.js` (extraire des modules avant de migrer).
4. `scripts/*.mjs` en dernier.

Vérifier à chaque lot : `npm run typecheck`, `npm test`, `npm run format:check`,
`npm run check:docs` ; `npm run test:udp` et `npm run e2e` pour le protocole.
Non vérifiable ici : partie WebGL réelle et pilotage humain.
