# typescript-migration — remplacer tout le JavaScript par TypeScript

- Tâche / PR : demandes de refactorisation des 17 et 19 novembre 2026 ; fondations en
  [#204](https://github.com/simonjamain/i-am-a-moucheron/pull/204), lots suivants en PR
  séparées (dernier : lot 9, six modules, le 26 novembre).
- Résultat attendu : plus aucun `.js` écrit à la main dans `src/`, `server/`, `scripts/` ;
  `npm run typecheck` vert ; comportement, URL servies et image Docker inchangés. Règles,
  outillage et pièges : [TypeScript](../typescript.md).

## État réel (vérifié sur la branche du lot 9 le 26 novembre 2026)

- Restent en `.js` : `src/client.js`, `server/game.js`, `server/index.js` (et le
  `server/assets.js` généré) et les `scripts/*.mjs`. Les données générées sont en `.ts`.
- `npm run ts:migrate -- --leaves` liste 3 « feuilles » : `server/index`, `server/game`,
  `src/client` ; il n'y a plus de petit module isolé, le reste demande d'extraire des modules.
- Lot 9 : `ordnance`, `shop-thumbs`, `hud`, `tank-reticle`, `heavy-sim` et
  `server/wave-preparation`. Types exportés pour la suite : `OrdnanceState`,
  `OrdnanceVehicle` (`ordnance.ts`), `HeavyWorld`, `HeavyProjectile`, `HeavyReport`
  (`heavy-sim.ts`), `EquipmentOptions` / `EquipmentModel` (`hud.ts`), `Draw`,
  `PreparedEnemy`, `PreparedGroup` (`wave-preparation.ts`). `integrateOrdnance` compare
  l'arme par `===` (plus de tableau alloué par pas).
- `ballisticMarks` (`tank-reticle.ts`) intègre un projectile **sans** `weapon` : toujours
  balistique, même pour une roquette. Comportement conservé ; à revoir si une arme
  propulsée reçoit un jour des graduations.
- Lot 8 : `Balance` / `BalanceKey` (`balance.ts`) remplacent la copie `RosterBalance` de
  `waves.ts` ; `Graphics` (`graphics.ts`) remplace l'interface recopiée `StationGraphics`
  de `sortie.ts`. `graphics.ts` ne passe plus à `makeBiplane`, `makeBiplaneBomber` et
  `makeH2` des arguments qu'ils ignoraient (comportement identique).
- Défauts révélés par le typage, **non corrigés** (à traiter à part, avec test) :
  - `PurchaseUI.open(item)` ne respecte pas la signature de `BedUI.open(bed)`
    (`@ts-expect-error` dans `src/purchase-ui.ts` : composer plutôt qu'hériter) ;
  - `GaitHelpers.lowest` renvoie `Vector3` alors que `CreatureHelpers.lowest` peut
    renvoyer `null` (`walkLegs` planterait sans os d'extrémité) ;
  - `splitBarricade` renvoie `number[]` là où les murs attendent `Vec2` ;
  - `src/ground-model.ts` : la dernière branche recalcule `intact` pour une barricade
    déjà traitée, la couleur « détruit » (`#574637`) n'apparaît jamais ;
  - `scripts/review-shadows.html` importe `../src/*.js` alors que ces modules sont en
    `.ts` : l'outil ne marche plus hors assembleur.
- Types locaux à centraliser dans `src/types.ts` lors de la migration du serveur :
  `WalkerHelpers` (quatre modèles, vers `walker-gait.ts`), `GroundStructure` /
  `GroundCommand` (`ground-defense-state.ts`), `StatusError` (défini deux fois), `Timer`,
  `SessionPlayer` (`server/index.js`), le véhicule « type + supplies » (`HudVehicle`, `EquipmentVehicle`,
  `ReserveVehicle`), l'epoch des instantanés (`BankSnapshot`, `BedSnapshot`), `MidgeRig`
  (même forme que `LoadingFly` de `boot.ts`), `ServicedVehicle`.
- Hors de cet environnement : partie WebGL réelle et pilotage humain après chaque lot.

## Prochaine action

1. Serveur : `server/index.js`, puis `server/game.js` (2 800 lignes) en extrayant d'abord des
   modules par sujet (achats, sièges, combat, défenses) et en regroupant les types ci-dessus.
2. `client.js` (7 200 lignes) : extraire des modules par système avant de migrer.
3. `scripts/*.mjs` en dernier : ils importent déjà les `.ts`.

À chaque lot : `npm run typecheck`, `npm test`, `npm run test:udp` et `npm run e2e` pour
le protocole ; contrôle d'équivalence décrit dans [TypeScript](../typescript.md#pièges-connus).
