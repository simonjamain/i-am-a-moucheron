# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 (routine) ;
  PR [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204) (fondations).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement de jeu, URL servies, image
  Docker inchangé. Règles : [TypeScript](../typescript.md).

## État réel (v413)

- Outillage en place : `tsconfig.json`, `npm run typecheck`, `npm run ts:migrate`,
  lecture `.ts` et effacement des types dans `scripts/assemble.mjs`, garde
  `scripts/test-typescript.mjs`, types partagés `src/types.ts`, lanceur
  `scripts/run-tests.mjs` + manifeste `scripts/suite.mjs`.
- Migrés : 121 fichiers `.ts` dans `src/` (liste : `ls src/*.ts`), `server/session.ts`,
  `server/stats.ts`, `server/stats-page.ts`, `scripts/audio-library-types.ts`.
- Lot 5 (v413, routine du 22 novembre 2026) : les 22 feuilles prêtes (toutes sauf
  `vehicle-anchors.ts`, généré).
  - Protocole : `udp-client`, `server/session`.
  - Domaine : `contracts`, `ground-defense`, `service-zones`, `base`,
    `route-navigation`, `reserve-feedback`, `changelog`.
  - Interface : `bank-ui`, `bed-ui`, `live-hud`, `flight-tuning-ui`.
  - Modèles : `character-model`, `rigged-creature`, `m1-model`, `b3-model`,
    `fortification-model`, `biplane-model`, `h2-model`, `office`.
  - Aucun `any` ajouté ; types locaux exportés depuis leur module. Contrôle
    d'équivalence (types effacés + Prettier contre l'ancien `.js`) : seuls des
    champs de classe déclarés et des commentaires de types diffèrent.
  - Défaut révélé par le typage et corrigé : en construction, `controlHintItems`
    renvoyait `false` pour l'outil non orientable (régression dans
    `test-control-hints.mjs`).
  - `ts-migrate.mjs` réécrit aussi les chemins `src/<m>.js` des commentaires.
- Lot 6 (routine du 23 novembre 2026) : les 17 feuilles écrites à la main.
  - Protocole : `ws-client`. Domaine : `routes`, `paid-service`,
    `ground-defense-state`, `vehicle-care`. Interface : `purchase-ui`,
    `appearance-picker`. Modèles : `ant`, `bee`, `beetle`, `midge`, `mosquito`,
    `rat`, `roach`, `spider`, `spiderling`, `ground`.
  - Aucun `any`. Contrôle d'équivalence passé (seuls commentaires et champs
    déclarés diffèrent ; `appearance-picker` remplace `!renderer?.isWebGLRenderer`
    par une forme équivalente, `@types/three` ne déclarant pas ce drapeau).
  - `debug-enemies.ts` : `RosterEntry` étend désormais `RouteEnemy` (typé par
    `routes.ts`).
  - Défauts révélés, **non corrigés** (à traiter à part, avec test) :
    `PurchaseUI.open(item)` ne respecte pas la signature de `BedUI.open(bed)`
    (`@ts-expect-error` commenté : composer plutôt qu'hériter) ;
    `GaitHelpers.lowest` renvoie `Vector3` alors que `CreatureHelpers.lowest`
    peut renvoyer `null` (`walkLegs` planterait sans os d'extrémité) ;
    `splitBarricade` renvoie `number[]` là où les murs attendent `Vec2` ;
    dans `ground-model.ts`, la dernière branche calcule `intact` pour une
    barricade déjà traitée plus haut : la couleur « détruit » (`#574637`) n'y
    apparaît jamais.
  - Types locaux à centraliser plus tard : `WalkerHelpers` (répété dans quatre
    modèles, à placer dans `walker-gait.ts`), `GroundStructure`/`GroundCommand`
    (`ground-defense-state.ts`, pour `server/game.js`, `ground-placement.js`,
    `ground-defense-ui.js`), `RouteEnemy` (fait : `WaveEnemy` l'étend),
    `GroundModelStructure`, `MidgeRig` (même forme que `LoadingFly` de `boot.ts`),
    `ServicedVehicle` (rejoint le véhicule « type + supplies »).
- Lot 7 (routine du 24 novembre 2026) : les 10 feuilles du lot 6, plus le worker.
  - Domaine : `waves` (`SPECIES … satisfies Record<string, SpeciesStats>`,
    **`EnemyType` dérivé** de ses clés et seulement réexporté par `src/types.ts` ;
    roster typé `WaveEnemy`, qui étend `RouteEnemy` ; `debug-enemies.ts` l'utilise),
    `ground-creatures` (`GroundUnit`, `GroundWorld`), `ground-placement`
    (`PlacementPreview` ; recherche de la construction visée factorisée dans
    `nearestStructure`), `wave-ground-paths`, `helicopter` (`HelicopterState`,
    `HelicopterControls`, `HeliAim`).
  - Rendu : `midge-batch`, `flyer-batch` (`FlyerType`), `walker-batch`
    (`WalkerType`), `wave-forecast-scene` (`ForecastGroup`, `TextLabel`),
    `wave-ground-worker` (URL servie inchangée).
  - `route-speed.js` **supprimé** : aucun importeur, et il lisait `enemy.speed`,
    champ disparu des profils ; la calibration qu'il gardait vit dans `speedMps`.
  - `groundFlow` n'exige plus qu'un `Pick<GroundDefenseState, 'structures'>`.
  - Aucun `any`. Contrôle d'équivalence passé : seuls champs déclarés, commentaires,
    variables locales non nulles (`detail`, `root`, `batches`) et les deux
    réécritures ci-dessus diffèrent. `scripts/test-dense-swarms.mjs` efface
    désormais les types avant d'évaluer `swarmFrame`.
- Candidats pour `src/types.ts` relevés au lot 5 : `StatusError`
  (`Error & { status?: number }`, défini deux fois), `Timer`, `SessionPlayer`
  (utilisé par `server/index.js`), le véhicule « type + supplies » (`HudVehicle`,
  `ReserveVehicle`) et l'epoch de base des instantanés (`BankSnapshot`,
  `BedSnapshot`, à élargir pour `purchase-ui.ts` qui étend `BedUI`).
- Restent écrits à la main : 14 `.js` dans `src/` (dont `client.js`, ≈ 7 000
  lignes, `graphics.js`, `hud.js`, `ground-defense-ui.js`, `heavy-sim.js`) ; les données générées sont en `.ts`,
  `server/game.js`, `server/index.js`, `server/wave-preparation.js` et les
  `scripts/*.mjs`. `npm run ts:migrate -- --leaves` donne la liste des modules
  prêts.
- Outil `scripts/review-shadows.html` : importe directement `../src/*.js` alors que
  plusieurs modules sont en `.ts` depuis les lots précédents ; il ne fonctionne plus
  sans passer par l'assembleur (défaut antérieur, non corrigé ici).
- Hors de cet environnement : partie WebGL réelle et pilotage humain.

## Décision prise : données générées en `.ts`

Routine du 23 novembre 2026 : les 44 `src/*-data.js` et `src/vehicle-anchors.js`
sont devenus des `.ts` sans annotation, et les importeurs (`scripts/import-*.py`,
`attach-castor-rims.py`, `split-vehicle-parts.mjs`, `rig-*.mjs`,
`measure-aircraft.mjs`) lisent et écrivent ces chemins. Mesures sur cette machine :
`npm run typecheck` 0,84 s avant, 0,95 s après ; `node scripts/assemble.mjs`
≈ 0,65 s avant, ≈ 0,78 s après ; `server/assets.js` identique octet pour octet
(hors empreinte de build et un commentaire de chemin). L'exclusion de `tsc`
envisagée n'est donc pas nécessaire. Règle : [TypeScript](../typescript.md#données-générées).

## Ordre conseillé

1. Feuilles du graphe d'imports : `npm run ts:migrate -- --leaves` (8 après le
   lot 7 : `tank-view`, `ground-crowd`, `wave-council-ui`, `mobile-flak`,
   `reload-hud`, `balance`, `graphics`, `ground-defense-ui`). `balance` d'abord :
   `RosterBalance` (`waves.ts`) en est un sous-ensemble à remplacer par son type.
2. Protocole : fait (`network`, `udp-client`, `ws-client`, `server/session`).
3. Domaine : fait pour `waves` (`EnemyType` dérivé, `WaveEnemy`).
4. Serveur : `server/wave-preparation`, `game`, `index` (`session` fait) ; regrouper
   alors les types partagés relevés ci-dessus dans `src/types.ts`.
5. Rendu/UI puis `client.js` (extraire des modules avant de migrer).
6. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

Vérifier à chaque lot : `npm run typecheck`, `npm test`, `npm run format:check`,
`npm run check:docs` ; `npm run test:udp` et `npm run e2e` pour le protocole.
