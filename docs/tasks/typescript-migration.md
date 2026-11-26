# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 ; fondations en
  [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204), lots suivants en PR
  séparées (dernier : lot 9, [#377](https://github.com/simonjamain/i-am-a-moucheron/pull/377)).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`, `scripts/` ;
  `npm run typecheck` vert ; comportement, URL servies et image Docker inchangés. Règles,
  outillage et pièges : [TypeScript](../typescript.md).

## État réel (vérifié sur `main` le 26 novembre 2026)

- Restent en `.js` : `src/client.js` (7 200 lignes), `server/game.js` (2 800 lignes),
  `server/index.js` (480 lignes), le `server/assets.js` généré et les `scripts/*.mjs`.
- `npm run ts:migrate -- --leaves` ne liste plus que `server/game` et `src/client` : il
  n'y a plus de petit module isolé, le reste demande d'extraire des modules.
- Types locaux à centraliser dans `src/types.ts` lors de la migration du serveur :
  `WalkerHelpers` (quatre modèles, vers `walker-gait.ts`), `GroundStructure` /
  `GroundCommand` (`ground-defense-state.ts`), `StatusError` (`udp-client.ts` et
  `server/session.ts`), `Timer`, `SessionPlayer` (`server/session.ts`), le véhicule
  « type + supplies » (`HudVehicle`, `EquipmentVehicle`, `ReserveVehicle`), l'epoch des
  instantanés (`BankSnapshot`, `BedSnapshot`), `MidgeRig` (même forme que `LoadingFly`
  de `boot.ts`), `ServicedVehicle`.
- Les défauts révélés par le typage et non corrigés sont hors de cette tâche : ils se
  traitent à part, avec test ([pièges connus](../typescript.md#pièges-connus)).
- Hors de cet environnement : partie WebGL réelle et pilotage humain après chaque lot.

## Prochaine action

1. Serveur : `server/index.js`, puis `server/game.js` en extrayant d'abord des modules
   par sujet (achats, sièges, combat, défenses) et en regroupant les types ci-dessus.
2. `client.js` : extraire des modules par système avant de migrer.
3. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

À chaque lot : `npm run typecheck`, `npm test`, `npm run test:udp` et `npm run e2e` pour
le protocole ; contrôle d'équivalence décrit dans [TypeScript](../typescript.md#pièges-connus).
