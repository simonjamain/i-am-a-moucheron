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
    `ground-defense-ui.js`), `RouteEnemy` (pour `waves.js`),
    `GroundModelStructure`, `MidgeRig` (même forme que `LoadingFly` de `boot.ts`),
    `ServicedVehicle` (rejoint le véhicule « type + supplies »).
- Candidats pour `src/types.ts` relevés au lot 5 : `StatusError`
  (`Error & { status?: number }`, défini deux fois), `Timer`, `SessionPlayer`
  (utilisé par `server/index.js`), le véhicule « type + supplies » (`HudVehicle`,
  `ReserveVehicle`) et l'epoch de base des instantanés (`BankSnapshot`,
  `BedSnapshot`, à élargir pour `purchase-ui.ts` qui étend `BedUI`).
- Restent écrits à la main : 25 `.js` dans `src/` (dont `client.js`, ≈ 7 000
  lignes, `waves.js`, `graphics.js`, `hud.js`), plus 44 modules de données générées,
  `server/game.js`, `server/index.js`, `server/wave-preparation.js` et les
  `scripts/*.mjs`. `npm run ts:migrate -- --leaves` donne la liste des modules
  prêts.
- Outil `scripts/review-shadows.html` : importe directement `../src/*.js` alors que
  plusieurs modules sont en `.ts` depuis les lots précédents ; il ne fonctionne plus
  sans passer par l'assembleur (défaut antérieur, non corrigé ici).
- Hors de cet environnement : partie WebGL réelle et pilotage humain.

## Décision en attente (utilisateur)

**Données générées `src/*-data.js`** (Meshy, personnages) : proposition — faire
émettre `.ts` par les générateurs, sans annotations, exclus de `tsc` si la
vérification devient lente.

## Ordre conseillé

1. Feuilles du graphe d'imports : `npm run ts:migrate -- --leaves` (liste à jour ;
   `vehicle-anchors.ts` est généré par `import-meshy-vehicle.py`, voir la décision).
2. Protocole : `ws-client` (`network`, `udp-client`, `server/session` faits).
3. Domaine : `routes`, `waves` (puis dériver `EnemyType` de
   `keyof typeof ENEMY_TYPES` et retirer la copie de `src/types.ts`).
4. Serveur : `server/wave-preparation`, `game`, `index` (`session` fait) ; regrouper
   alors les types partagés relevés ci-dessus dans `src/types.ts`.
5. Rendu/UI puis `client.js` (extraire des modules avant de migrer).
6. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

Vérifier à chaque lot : `npm run typecheck`, `npm test`, `npm run format:check`,
`npm run check:docs` ; `npm run test:udp` et `npm run e2e` pour le protocole.
