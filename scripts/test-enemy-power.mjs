// Issue #210: one balance unit, "power", for enemies, waves, rewards and bin damage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POWER_REFERENCE, computeEnemyPower, powerTable } from '../src/enemy-power.ts';
import { ENEMY_TYPES, ENEMY_POWER, enemyPower } from '../src/waves.ts';
import { BALANCE_FIELDS, DEFAULT_BALANCE, validateBalance } from '../src/balance.ts';
import { directorBudget, prepareRoster } from '../server/wave-preparation.ts';
import { Game } from '../server/game.js';

const near = (actual, expected, epsilon = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

// The reference is frozen and a species with its statistics is worth exactly 1.
assert.ok(Object.isFrozen(POWER_REFERENCE));
assert.deepEqual(POWER_REFERENCE, { hp: 100, speedMps: 0.11, size: 1, flying: true });
const ref = { hp: 100, speedMps: 0.11, size: 1 };
assert.equal(computeEnemyPower(ref, { ref }), 1);

// Published values with the current statistics.
for (const [type, expected] of Object.entries({
  midge: 1,
  ant: 0.58,
  mosquito: 2.06,
  roach: 1.38,
  guard: 4.03,
  brute: 6.93,
  spiderling: 0.08,
  rat: 24.47,
}))
  near(ENEMY_POWER[type], expected);
assert.equal(enemyPower('rat'), ENEMY_TYPES.rat.power);
assert.ok(Object.isFrozen(ENEMY_POWER));

// Changing the midge changes no other species: the formula never reads it.
const SPECIES = Object.fromEntries(
  Object.entries(ENEMY_TYPES).map(([type, { power, ...stats }]) => [type, { ...stats }]),
);
const tuned = { ...SPECIES, midge: { ...SPECIES.midge, hp: 9999, speedMps: 1, size: 7 } };
const before = powerTable(SPECIES),
  after = powerTable(tuned);
for (const type of Object.keys(SPECIES))
  if (type === 'midge') assert.notEqual(after.midge, before.midge);
  else assert.equal(after[type], before[type], type + ' is independent from the midge');
assert.deepEqual(before, ENEMY_POWER);

// Offspring: the laying spider carries its brood.
const spiderBody =
  ((ENEMY_TYPES.spider.hp / 100) *
    (ENEMY_TYPES.spider.speedMps / 0.11) *
    Math.sqrt(1 / ENEMY_TYPES.spider.size)) /
  1.5;
near(spiderBody, 2.64);
near(ENEMY_POWER.spider, spiderBody + 100 * ENEMY_POWER.spiderling);
// The issue rounds the brood to 100 × 0,08 ≈ 8; the exact formula gives 10,94.
near(ENEMY_POWER.spider, 10.94, 0.01);
// A manual factor only touches its own species.
const boosted = { ...SPECIES, ant: { ...SPECIES.ant, powerFactor: 2 } };
near(powerTable(boosted).ant, ENEMY_POWER.ant * 2, 1e-9);
assert.equal(powerTable(boosted).roach, ENEMY_POWER.roach);

// `cost` and `leak` are gone from species, waves and the source.
for (const [type, profile] of Object.entries(ENEMY_TYPES))
  assert.ok(!('cost' in profile) && !('leak' in profile), type);
for (const file of ['server/game.js', 'server/wave-preparation.ts', 'src/client.js']) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /waveStipend|waveReward/, file + ' has no wave stipend');
  assert.doesNotMatch(text, /ENEMY_TYPES\[[^\]]+\]\.(cost|leak)|\be\.leak\b|\.cost\b.*ENEMY/, file);
}

// Wave budget: W(1) g^(n-1) N^0.9, no ceiling.
assert.equal(directorBudget(1), 32);
near(directorBudget(2), 48, 1e-9);
near(directorBudget(10), 32 * 1.5 ** 9, 1e-9);
assert.ok(directorBudget(40) > 2400, 'no 2 400 ceiling');
for (const wave of [1, 5, 12])
  for (const n of [2, 3, 10]) {
    assert.ok(directorBudget(wave, n) > directorBudget(wave, n - 1), 'more players, more power');
    near(directorBudget(wave, n), directorBudget(wave) * n ** 0.9, 1e-9);
  }
assert.equal(directorBudget(7, 1), directorBudget(7), 'N = 1 is the base budget');
// Room settings change the three parameters.
near(directorBudget(3, 1, { ...DEFAULT_BALANCE, waveGrowth: 1.2 }), 32 * 1.2 ** 2, 1e-9);
near(directorBudget(1, 1, { ...DEFAULT_BALANCE, firstWavePower: 50 }), 50, 1e-9);
near(directorBudget(1, 4, { ...DEFAULT_BALANCE, playerExponent: 0.5 }), 64, 1e-9);
assert.deepEqual(
  [DEFAULT_BALANCE.waveGrowth, DEFAULT_BALANCE.firstWavePower, DEFAULT_BALANCE.playerExponent],
  [1.5, 32, 0.9],
);
validateBalance({ waveGrowth: 1.25, firstWavePower: 40, playerExponent: 1 });
for (const bad of [
  { waveGrowth: 0.9 },
  { firstWavePower: 0 },
  { playerExponent: -0.05 },
  { waveGrowth: 1.23 },
])
  assert.throws(() => validateBalance(bad), /invalide/);
for (const key of ['waveGrowth', 'firstWavePower', 'playerExponent'])
  assert.equal(BALANCE_FIELDS[key].max, undefined, 'no arbitrary ceiling');
// The roster of a wave spends that power.
const small = prepareRoster(3, DEFAULT_BALANCE, undefined, 1).budget;
const large = prepareRoster(3, DEFAULT_BALANCE, undefined, 8).budget;
assert.ok(large > small * 5 && large <= directorBudget(3, 8) + 1e-6);

// Game: N counts every pilot (purgatory included), souls pay their power, the bin takes it.
let now = 1000000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'POWER', name: 'A' }),
  b = game.join({ code: 'POWER', name: 'B' });
game.join({ code: 'POWER', name: 'C' });
const room = game.rooms.get('POWER');
room.pilots.get(b.id).life = 'dead';
game.prepareWave(room);
assert.equal(room.preparation.players, 3, 'three pilots, one of them in purgatory');
near(room.preparation.power, directorBudget(1, 3), 0.6);
near(room.upcomingPlan.budget, directorBudget(1, 3), 0.6);

room.dollars = 0;
room.rewardCount = 0;
room.rewardFraction = 0;
for (const [type, key] of [
  ['roach', 'r'],
  ['rat', 'x'],
  ['midge', 'm'],
]) {
  const dollars = room.dollars;
  const soul = game.soul(room, 'enemy', 'w:' + key, type, 'purgatory', type);
  game.releaseSoul(room, soul);
  near(room.dollars - dollars, ENEMY_POWER[type], 0.011);
}
room.balance.rewards = 2;
const doubled = room.dollars;
game.releaseSoul(room, game.soul(room, 'enemy', 'w:d', 'rat', 'purgatory', 'rat'));
near(room.dollars - doubled, ENEMY_POWER.rat * 2, 0.011);
// No wave pays anything by itself.
room.balance.rewards = 1;
const snapshot = game.snapshot(room);
assert.equal(snapshot.waveReward, undefined);
void a;

// Bin damage equals the power of the escaping enemy, whatever its species.
for (const [index, type] of ['roach', 'rat'].entries()) {
  const g = new Game({ now: () => now });
  const p = g.join({ code: 'BIN' + index, name: 'A' });
  const r = g.rooms.get('BIN' + index);
  g.command(r.code, p.id, 'start');
  now += 60000;
  r.pilots.get(p.id).seen = now;
  g.command(r.code, p.id, 'sync', { mode: 'foot', state: p.state });
  assert.equal(r.phase, 'combat');
  const keep = r.plan.roster.find((e) => e.type === 'ant');
  // Replace the whole wave by one enemy of the tested species.
  const target = { ...keep, type, ...ENEMY_TYPES[type], id: 0, spawn: 0, duration: 1 };
  r.plan = { budget: target.power, roster: [target] };
  r.kills.clear();
  r.groundAgents[0] = { arrived: true }; // ground species arrive through their agent
  now = r.started + 5000;
  r.infestation = 0;
  g.advance(r);
  near(r.infestation, ENEMY_POWER[type], 0.011);
}
console.log(
  'PASS: power formula and reference, offspring, budget × N^0.9, rewards by power, bin damage by power, room settings.',
);
