# Ajouter un ennemi ou un véhicule

Liste des endroits à modifier, du domaine partagé vers le rendu. Les gardes
automatiques sont `scripts/test-registries.mjs` (tables incomplètes, nommées dans
l'erreur) et `npm run typecheck` (tables `Record<EnemyType, …>` en TypeScript).
Lancer `npm test -- registries typescript` après chaque étape, puis la suite entière.
Pour un modèle Meshy, suivre d'abord [le pipeline d'assets](asset-pipeline.md).

## Nouvelle espèce d'insecte

Domaine partagé (serveur et client) :

1. `src/waves.js` — profil dans `ENEMY_TYPES` (`name`, `cost`, `hp`, `size`,
   `speedMps`, `leak`, `color`, `ground` pour un marcheur, `offspringOnly` pour une
   progéniture, `onDeath` pour une ponte) ; vague d'apparition dans
   `ENEMY_UNLOCK_WAVE` (ordre des clés = ordre de tirage) ; `GROUND_LANES` pour
   un marcheur.
2. `src/types.ts` — ajouter la clé à `EnemyType`, puis suivre les erreurs de `tsc`.
3. `src/scale.ts` — facteur de taille dans `ENEMY_SIZE_FACTORS` (rendu et collisions).
4. `server/wave-preparation.js` — taille de meute dans `PACKS` (espèce tirée).
5. `src/ground-creatures.js` — gabarit `GROUND_BODY_SIZES` (marcheur) et, s'il
   attaque, `GROUND_ATTACK_DAMAGE`.

Rendu et interface :

6. Modèle : `src/<espèce>-model.js` (+ `-data.js` généré), puis entrée dans
   `WALKERS` (`src/walker-batch.js`) ou `FLYERS` (`src/flyer-batch.js`), et dans la
   liste d'assets de `scripts/assemble.mjs`.
7. `src/wave-forecast-scene.js` — symbole dans `speciesSymbols` ;
   `src/debug-enemies.ts` — place dans `DEBUG_ENEMY_TYPES` (cartes du mode debug,
   vérifié par `scripts/test-debug-enemies.mjs`).
8. Vérifier les cas particuliers par nom d'espèce : `grep -n "'midge'\|'spiderling'" src server`.
9. Documenter dans [le bestiaire](enemy-bestiary.md) et, si le joueur le voit, un fragment `changelog.d/` ([nouveautés](changelog.md)).

## Nouveau véhicule

Les règles de véhicule sont encore réparties par type (`type === 'flaktruck'`) ;
la garde vérifie les tables, pas les cas particuliers. Partir d'un véhicule
proche et chercher son identifiant : `grep -rn "'castor'" src server`.
`VehicleType` (`src/fleet.ts`) est dérivé des clés de `VEHICLES` : une table
TypeScript `Record<VehicleType, …>` signale donc à `tsc` chaque entrée manquante,
sans liste de types à recopier ailleurs.

1. `src/fleet.ts` — entrée dans `VEHICLES` (`name`, `seats`, dimensions, vol ou
   roulage ; champs décrits par `VehicleProfile`, vérifiés par `satisfies`) et,
   si le véhicule ne partage pas la place par défaut, son emplacement de
   stationnement dans `PAD_OFFSET`. Un nouveau poste s'ajoute à `SeatName` et
   `SEAT_NAMES`.
2. `src/equipment.ts` — article `SHOP` de `kind: 'vehicle'` (prix, description ; forme
   `ShopItem` vérifiée par `satisfies`, clés exportées en `ShopKey`).
3. `src/shop-catalog.ts` — colonne dans `SHOP_CATEGORIES`.
4. `src/contracts.ts` — contrats d'embarquement de chaque siège (`contractKey`,
   tableau des rôles pour les sièges spécifiques).
5. Armes et réserves : `src/armament.ts` (nouvelle arme lourde : entrée `HEAVY`, forme
   `HeavyWeapon`), `src/logistics.ts`, `src/ordnance.js`.
6. Rendu et HUD : `src/graphics.js` (modèle), `src/hud.js`, `src/shop-thumbs.js` ;
   postes visables de chaque siège dans `src/seat-posts.ts` (`scripts/test-seat-posts.mjs`
   exige un poste par siège).
7. Autorité : `server/game.js` pour toute arme lourde ou règle simulée au serveur.
8. Documenter dans [véhicules et banque](vehicles-bank.md) et, si le joueur le voit, un fragment `changelog.d/` ([nouveautés](changelog.md)).
