# TypeScript : fonctionnement et migration

Le code passe progressivement de JavaScript à TypeScript, module par module, sans
bundler ni étape de compilation. Objectif final : plus aucun `.js` écrit à la main
dans `src/`, `server/` et `scripts/`. L'état et la prochaine étape sont suivis dans
[la note de migration](tasks/typescript-migration.md).

## Principe : types effacés, pas de compilation

- **Node** (≥ 22.18, image Docker en Node 24) exécute directement les `.ts` par
  effacement des types (_type stripping_) : serveur, tests et scripts importent
  `../src/scale.ts` comme un module ordinaire. Node 22 affiche un
  `ExperimentalWarning` à l'effacement ; il est sans effet.
- **Navigateur** : `scripts/assemble.mjs` lit `src/<nom>.ts` s'il existe (sinon
  `src/<nom>.js`), efface ses types avec `stripTypeScriptTypes` de `node:module`
  (positions conservées) et le sert à **l'URL inchangée** `/<nom>.js`. Les imports
  relatifs `./scale.ts` sont réécrits vers cette URL versionnée.
- **Vérification** : `npm run typecheck` (`tsc`, aucune émission). `tsconfig.json`
  ne contrôle que les `.ts` ; les `.js` restants sont lus pour l'inférence
  (`allowJs`) sans être vérifiés (`checkJs: false`).
- `scripts/test-typescript.mjs` (dans `npm test`) exécute `tsc`, interdit un même
  module en `.js` et `.ts` et vérifie que chaque asset servi depuis un `.ts` est du
  JavaScript valide.

## Règles d'écriture

1. **Syntaxe effaçable uniquement** (`erasableSyntaxOnly`) : pas d'`enum`, de
   `namespace` à valeur, de propriétés de paramètres de constructeur
   (`constructor(private x)`), ni d'`import x = require()`. Utiliser des objets
   `as const` / `Object.freeze` et des unions de chaînes.
2. **Imports avec extension réelle** : `import { MAP } from './scale.ts'`. Les
   imports de types s'écrivent `import type { Vec3 } from './types.ts'`
   (`verbatimModuleSyntax`). Les URL absolues du navigateur dans `client.js`
   (`'/scale.js'`) restent en `.js`.
3. **Three.js** : les modules reçoivent l'espace de noms injecté `T` ; le typer
   `T: Three` (`src/types.ts`) et les objets avec `import type * as THREE from 'three'`
   (types `@types/three` alignés sur la révision embarquée r170). Aucun import
   d'exécution de `'three'` : le navigateur charge toujours `vendor/`.
4. **Champs de classe** déclarés (`samples: ClockSample[];`) avant le constructeur.
5. **Tables exhaustives** : typer `Record<EnemyType, …>` (ou futur `VehicleType`)
   pour que `tsc` liste chaque table à compléter lors d'un ajout. Voir
   [ajouter du contenu](adding-content.md).
6. **Comportement identique** : une migration ne change ni la logique ni les
   allocations des chemins chauds. Préférer `readonly number[]` à une conversion
   (`Array.from`) quand une fonction reçoit des tableaux.

## Migrer un module

```sh
npm run ts:migrate -- src/route-speed.js src/delivery.js   # --dry-run pour prévisualiser
npm run typecheck                                           # ajouter les types jusqu'au vert
npm test
```

`scripts/ts-migrate.mjs` renomme avec `git mv` et réécrit les références : imports
relatifs de `src/`, `server/`, `scripts/`, chemins lus par les tests
(`'src/scale.js'`) et mentions Markdown (sauf `docs/archive/`). Il ne touche ni
aux URL du navigateur ni aux noms construits dynamiquement : relire le diff.
Migrer de préférence des feuilles du graphe d'imports (modules sans import local
non migré), par lots cohérents, puis remonter vers `client.js` et `server/game.js`.

## Écart avec la consigne précédente

`docs/code-structure.md` décrivait « JavaScript ESM natif » et `README.md`
Node 22.13+. La base exige désormais Node 22.18+ (effacement des types activé par
défaut) et devient mixte JS/TS pendant la migration. Le choix « pas de bundler »
est conservé : les URL de contenu et le Dockerfile restent
identiques ; seule la lecture des sources par l'assembleur change.
