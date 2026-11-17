// Per-species tables must stay in step with ENEMY_TYPES (src/waves.js), and
// per-vehicle tables with VEHICLES (src/fleet.js).
// Adding an enemy: follow docs/adding-content.md; this test names every table
// still missing the new key. tsc enforces the same for `Record<EnemyType, …>`.
import assert from 'node:assert/strict';
import { ENEMY_TYPES, ENEMY_UNLOCK_WAVE, GROUND_LANES } from '../src/waves.js';
import { ENEMY_SIZE_FACTORS } from '../src/scale.ts';
import { speciesSymbols } from '../src/wave-forecast-scene.js';
import { PACKS } from '../server/wave-preparation.js';
import { GROUND_BODY_SIZES, GROUND_ATTACK_DAMAGE } from '../src/ground-creatures.js';
import { WALKERS } from '../src/walker-batch.js';
import { FLYERS } from '../src/flyer-batch.js';
import { VEHICLES } from '../src/fleet.js';
import { SHOP } from '../src/equipment.js';
import { SHOP_CATEGORIES } from '../src/shop-catalog.js';
import { CONTRACTS, contractKey } from '../src/contracts.js';

const all = Object.keys(ENEMY_TYPES).sort();
const pick = (filter) =>
  Object.entries(ENEMY_TYPES)
    .filter(([, profile]) => filter(profile))
    .map(([type]) => type)
    .sort();
const drawn = pick((p) => !p.offspringOnly);
const ground = pick((p) => p.ground);
const flying = pick((p) => !p.ground);
const keys = (table) => Object.keys(table).sort();

const expectKeys = (name, table, expected) =>
  assert.deepEqual(keys(table), expected, `${name} must list exactly: ${expected.join(', ')}`);

expectKeys('ENEMY_SIZE_FACTORS (src/scale.ts)', ENEMY_SIZE_FACTORS, all);
expectKeys('speciesSymbols (src/wave-forecast-scene.js)', speciesSymbols, all);
expectKeys('ENEMY_UNLOCK_WAVE (src/waves.js)', ENEMY_UNLOCK_WAVE, drawn);
expectKeys('PACKS (server/wave-preparation.js)', PACKS, drawn);
expectKeys('GROUND_LANES (src/waves.js)', GROUND_LANES, ground);
expectKeys('GROUND_BODY_SIZES (src/ground-creatures.js)', GROUND_BODY_SIZES, ground);
// Spiderlings use their own instanced batch; the midge has its own batch too.
expectKeys(
  'WALKERS (src/walker-batch.js)',
  WALKERS,
  ground.filter((t) => t !== 'spiderling'),
);
expectKeys(
  'FLYERS (src/flyer-batch.js)',
  FLYERS,
  flying.filter((t) => t !== 'midge'),
);
for (const type of Object.keys(GROUND_ATTACK_DAMAGE))
  assert.ok(ground.includes(type), `GROUND_ATTACK_DAMAGE.${type} is not a ground species`);
for (const [type, profile] of Object.entries(ENEMY_TYPES)) {
  for (const field of ['name', 'cost', 'hp', 'size', 'speedMps', 'leak', 'color'])
    assert.ok(profile[field] !== undefined, `ENEMY_TYPES.${type}.${field} is required`);
  if (profile.onDeath)
    assert.ok(ENEMY_TYPES[profile.onDeath.spawn], `${type}.onDeath spawns an unknown species`);
}

// Vehicles: sold in the shop, shown in a named column, a boarding contract per seat.
const vehicles = keys(VEHICLES);
expectKeys(
  "SHOP entries of kind 'vehicle' (src/equipment.js)",
  Object.fromEntries(Object.entries(SHOP).filter(([, item]) => item.kind === 'vehicle')),
  vehicles,
);
const shelved = new Set(SHOP_CATEGORIES.flatMap((c) => c.items));
for (const type of vehicles) {
  assert.ok(shelved.has(type), `SHOP_CATEGORIES (src/shop-catalog.js) must place ${type}`);
  const { name, seats } = VEHICLES[type];
  assert.ok(name && seats?.length, `VEHICLES.${type} needs a name and seats`);
  for (const seat of seats)
    assert.ok(
      CONTRACTS[contractKey('boarding', seat, type)]?.length,
      `No boarding contract for ${type}/${seat} (src/contracts.js, contractKey)`,
    );
}
console.log(
  `Registries: ${all.length} species across 9 tables, ${vehicles.length} vehicles across shop, catalogue and contracts`,
);
