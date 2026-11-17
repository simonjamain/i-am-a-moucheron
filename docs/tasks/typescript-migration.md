# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demande de refactorisation du 17 novembre 2026 (routine) ; PR [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204).
- Branche : `refactor/typescript-foundation` rebasée sur `049ba33` (v314).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`,
  `scripts/` ; `npm run typecheck` vert ; comportement de jeu, URL servies, image
  Docker et Worker historique inchangés. Règles : [TypeScript](../typescript.md).

## État réel

Fait (v315–v316) :

- Outillage : `tsconfig.json`, `npm run typecheck`, `npm run ts:migrate`
  (`scripts/ts-migrate.mjs`), lecture `.ts` et effacement des types dans
  `scripts/assemble.mjs`, garde `scripts/test-typescript.mjs`, `src/types.ts`.
- Lanceur `scripts/run-tests.mjs` + manifeste `scripts/suite.mjs` (même ordre, mêmes
  processus) ; filtres `npm test -- <fragment>`, `--bail`, `--list`.
- Modules migrés et typés (10) : `scale`, `units`, `server-clock`,
  `oriented-collider`, `swept-geometry`, `swept-broadphase`, `air-current`
  (retiré en version 319 avec le ventilateur), `ballistics`, `shadow-settings`,
  `insect-status`. Nouveaux modules écrits en TypeScript : `debug-enemies`,
  `debug-tools` (version 320).
- `ENEMY_UNLOCK_WAVE` (src/waves.js) remplace les deux tables de déblocage
  dupliquées (waves.js et server/wave-preparation.js), valeurs et ordre identiques.
- Garde `scripts/test-registries.mjs` et guide [ajouter du contenu](../adding-content.md).

Restant (≈ 128 modules écrits à la main + 38 données générées) :

1. Feuilles sans import local non migré, par lots : `layout`, `field-physics`,
   `flight`, `mouse-flight`, `personal-aim`, `muzzle`, `salvos`, `rewards`,
   `bank`, `armament`, `brick-rules`, `ground-ammo`, `ground-motion`,
   `interaction-timing`, `input`, `walker-gait`, `castor-wheels`, `pheromone-trail`.
2. Protocole réseau (gain de typage élevé) : `snapshot-wire`, `motion-wire`, puis
   `udp-protocol`, `udp-client`, `ws-client`, `network`.
3. Domaine : `routes`, `route-speed`, `route-navigation`, `waves` (puis dériver
   `EnemyType` de `keyof typeof ENEMY_TYPES`), `fleet` (introduire `VehicleType`),
   `equipment`, `logistics`, `contracts`.
4. Serveur : `server/wave-preparation`, `server/session`, `server/game`, `server/index`.
5. Rendu/UI puis `client.js` (6 500 lignes : extraire des modules avant de migrer).
6. `scripts/*.mjs` (tests et outils) en dernier : ils importent déjà les `.ts`.

## Décisions à prendre (utilisateur)

- **Données générées `src/*-data.js`** (Meshy, personnages) : proposition — faire
  émettre `.ts` par les générateurs, sans annotations, exclus de `tsc` si la
  vérification devient lente.
- **Worker historique** (`src/server.js`, `worker/index.js`, `drizzle/`) : le
  migrer coûte cher pour un runtime non déployé ; proposition — le retirer dans
  une tâche dédiée plutôt que le convertir. Tant qu'il existe, respecter la règle
  « imports sur une ligne » des modules inclus.

## Vérifications

- `npm test` : 153 scripts ; vert au dernier passage hormis l'échec aléatoire
  connu de `test-wave-preparation.mjs` (0 échec sur 60 relances, avant comme après).
- `npm run typecheck`, `npm run check:docs`, `npm run format:check`, `npm run build`
  et `node scripts/validate-artifact.mjs` : voir la PR.
- Non effectués : `docker build` local (Docker indisponible dans la session ; contrôle
  CI `Docker build` à la place), partie
  WebGL/UDP réelle dans un navigateur.

## Prochaine action

`npm run ts:migrate -- src/layout.js src/field-physics.js src/flight.js` puis
typer jusqu'au vert de `npm run typecheck` et `npm test`.
