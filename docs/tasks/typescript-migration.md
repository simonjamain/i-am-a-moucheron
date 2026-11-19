# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 (routine) ;
  PR [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204) (fondations).
- Branche du lot 2 : `refactor/typescript-leaves-batch1`, rebasée sur `c21e47c` (v348).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement de jeu, URL servies, image
  Docker inchangé. Règles : [TypeScript](../typescript.md).

## État réel

Fait (v315–v316, fondations) :

- Outillage : `tsconfig.json`, `npm run typecheck`, `npm run ts:migrate`
  (`scripts/ts-migrate.mjs`), lecture `.ts` et effacement des types dans
  `scripts/assemble.mjs`, garde `scripts/test-typescript.mjs`, `src/types.ts`.
- Lanceur `scripts/run-tests.mjs` + manifeste `scripts/suite.mjs` ; filtres
  `npm test -- <fragment>`, `--bail`, `--list`.
- Modules migrés : `scale`, `units`, `server-clock`, `oriented-collider`,
  `swept-geometry`, `swept-broadphase`, `ballistics`, `shadow-settings`,
  `insect-status` ; écrits en TypeScript : `debug-enemies`, `debug-tools`,
  `enemy-power`, `audio/*`, `game-audio/*`.
- Garde `scripts/test-registries.mjs` et guide [ajouter du contenu](../adding-content.md).

Fait (lot 2, routine du 19 novembre, v346) — 19 modules typés, comportement identique :

- Feuilles : `layout`, `field-physics`, `flight` (`FlightState`, `FlightProfile`),
  `mouse-flight`, `personal-aim`, `muzzle`, `salvos`, `rewards`, `bank` (`Loan`,
  `Bank`), `brick-rules`, `ground-ammo`, `ground-motion` (`GroundPose`),
  `interaction-timing`, `input` (`PadState`), `walker-gait` (`LegSpec`,
  `GaitHelpers`), `castor-wheels`.
- Protocole : `snapshot-wire` (`WireSnapshot`, `WireState`, `PatchNode`,
  `RosterGroup`), `motion-wire` (`Schema`, `Codec`, `MotionBatchEntry`).
- `fleet` : `VEHICLES` devient un seul littéral `satisfies Record<string, VehicleProfile>`
  (même ordre de clés, mêmes valeurs : comparaison JSON et fonctions vérifiées
  contre l'ancien module), `VehicleType = keyof typeof VEHICLES`, `SeatName`.
  La cascade de ternaires de `vehiclePad` devient la table `PAD_OFFSET`
  (`Partial<Record<VehicleType, number>>`, défaut −7). `seatMount`, appelé nulle
  part, est supprimé.

Restant (≈ 120 modules écrits à la main + 40 données générées) :

1. Feuilles restantes (aucun import local non migré) : `character-appearances`,
   `ground-fortifications`, `lab-ui`, `meshy-texture`, `ground-sentry`, `airdrop`,
   `vehicle-anchors`, `flight-tuning`, `control-focus`, `seat-icons`,
   `vehicle-livery`, `pheromone-trail`, `toon`, `boot`, `aircraft-fire`,
   `creature-batch`, `rigged-creature` (typer `GaitHelpers` côté fournisseur),
   `insect-hits`, `purgatory-physics`. Liste à jour : `npm run ts:migrate -- --leaves`.
2. Protocole : `udp-protocol`, `udp-client`, `ws-client`, `network` (s'appuient
   désormais sur les types de `snapshot-wire` / `motion-wire`).
3. Domaine : `layouts`, `routes`, `route-speed`, `route-navigation`, `waves` (puis
   dériver `EnemyType` de `keyof typeof ENEMY_TYPES` et retirer la copie de
   `src/types.ts`), `equipment`, `logistics`, `contracts`, `armament`.
4. Serveur : `server/wave-preparation`, `server/session`, `server/game`, `server/index`.
5. Rendu/UI puis `client.js` (6 600 lignes : extraire des modules avant de migrer).
6. `scripts/*.mjs` (tests et outils) en dernier : ils importent déjà les `.ts`.

## Décisions à prendre (utilisateur)

- **Données générées `src/*-data.js`** (Meshy, personnages) : proposition — faire
  émettre `.ts` par les générateurs, sans annotations, exclus de `tsc` si la
  vérification devient lente.

## Vérifications (lot 2)

- `npm test` : 160 scripts verts avant (43,4 s) et après (44,8 s).
- `npm run typecheck`, `npm run format:check`, `npm run check:docs` : verts.
- `npm run test:udp` et `npm run e2e` (Chromium headless : reprise, lots de
  mouvements binaires, repli TCP, phases de chute) : verts.
- Non effectués : `docker build` (Docker indisponible), partie WebGL réelle à
  plusieurs joueurs, pilotage humain.

## Prochaine action

Migrer le lot de feuilles du point 1 (`npm run ts:migrate -- src/flight-tuning.js
src/control-focus.js src/seat-icons.js …`), puis le protocole du point 2.
