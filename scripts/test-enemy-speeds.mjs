import assert from 'node:assert/strict';
import {
  ENEMY_TYPES,
  debugSwarmRoster,
  enemyTravelSpeed,
  spawnOffspring,
  swarmFrame,
  wavePlan,
} from '../src/waves.js';
import { enemyRoute, enemyRoutePosition, routeDuration } from '../src/routes.js';
import { DEFAULT_BALANCE, retimeRoster, scaleRoster } from '../src/balance.js';

// The game office is in world metres, not creature-scaled dimensions.
const expected = {
  ant: 0.17,
  roach: 0.125,
  midge: 0.22,
  dart: 0.26,
  guard: 0.175,
  mosquito: 0.23,
  rat: 0.095,
  spider: 0.11,
  spiderling: 0.15,
  brute: 0.14,
};
assert.deepEqual(
  Object.fromEntries(Object.entries(ENEMY_TYPES).map(([type, profile]) => [type, profile.speedMps])),
  expected,
);
for (const [type, profile] of Object.entries(ENEMY_TYPES)) {
  for (const size of [0.01, 0.3, 1, 10, 100]) {
    const sized = { ...profile, type, size };
    assert.equal(enemyTravelSpeed(sized), expected[type], type + ' must ignore 3D size');
    assert.equal(enemyTravelSpeed(sized, 2), 2 * expected[type]);
  }
}
assert.throws(() => enemyTravelSpeed({ speedMps: 0 }), /invalide/);
assert.throws(() => enemyTravelSpeed({ speedMps: 0.2 }, Infinity), /invalide/);

for (const wave of [1, 2, 4, 12, 20, 100]) {
  const roster = wavePlan('SPEED-CHECK', wave, 123).roster;
  for (const enemy of roster) {
    assert.equal(enemy.travelSpeed, expected[enemy.type], 'director speed independent of wave/route');
    assert.ok(
      Math.abs((enemy.duration - enemy.entryHold) * enemy.travelSpeed - enemyRoute(enemy).length) < 1e-8,
      'duration follows real active route length at constant metres/second',
    );
  }
}
const params = {
  room: 'SPEED-CHECK',
  wave: 12,
  started: 0,
  now: 0,
  balance: DEFAULT_BALANCE,
  firstId: 0,
  revision: 1,
};
const small = debugSwarmRoster({ midge: 10 }, params);
const big = debugSwarmRoster({ midge: 1000 }, params);
const huge = debugSwarmRoster({ midge: 5000 }, params);
for (const flock of [small, big, huge]) {
  assert.equal(flock[0].travelSpeed, expected.midge);
  assert.ok(flock.every((e) => e.travelSpeed === expected.midge));
  assert.ok(flock.every((e) => e.duration - e.entryHold > 0));
}
const mixed = debugSwarmRoster({ ant: 3, midge: 5, mosquito: 2, rat: 1, spider: 1 }, params);
assert.ok(mixed.every((e) => e.travelSpeed === expected[e.type]));
const faster = debugSwarmRoster(
  { midge: 3, mosquito: 3, spider: 1 },
  { ...params, balance: { ...DEFAULT_BALANCE, enemySpeed: 2 } },
);
assert.ok(faster.every((e) => e.travelSpeed === expected[e.type] * 2));
assert.ok(faster.every((e) => Math.abs(e.duration - e.entryHold - enemyRoute(e).length / e.travelSpeed) < 1e-8));
const scaled = scaleRoster(wavePlan('SPEED-SCALE', 6, 123), { ...DEFAULT_BALANCE, enemySpeed: 1.5 });
assert.ok(scaled.roster.every((e) => Math.abs(e.travelSpeed - expected[e.type] * 1.5) < 1e-9));
const retimed = structuredClone(mixed);
retimeRoster(retimed, 10, 0.5);
assert.ok(retimed.every((e) => e.travelSpeed === expected[e.type] * 0.5));
const mother = mixed.find((e) => e.type === 'spider');
const children = spawnOffspring(mother, [0.3, 0.01, 0.7], 7, DEFAULT_BALANCE, 200, 12);
assert.equal(children.length, 100);
assert.ok(children.every((e) => e.travelSpeed === expected.spiderling));
assert.ok(children.every((e) => Math.abs(routeDuration(e) * e.travelSpeed - enemyRoute(e).length) < 1e-8));

// Measure actual progress on the route, not only stored constants. The
// parametrisation is arc-length based, regardless of insect size.
for (const enemy of [small[0], mixed.find((e) => e.type === 'mosquito'), children[0]]) {
  const distance = enemyRoute(enemy).length;
  const t = enemy.entryHold + (enemy.duration - enemy.entryHold) * 0.45;
  const dt = 0.05;
  const u = (t - enemy.entryHold) / (enemy.duration - enemy.entryHold);
  const v = (t + dt - enemy.entryHold) / (enemy.duration - enemy.entryHold);
  const a = enemyRoutePosition(enemy, u);
  const b = enemyRoutePosition(enemy, v);
  const measured = Math.hypot(...a.map((x, i) => x - b[i])) / dt;
  assert.ok(measured <= enemy.travelSpeed * 1.001);
  assert.ok(measured > enemy.travelSpeed * 0.8, 'route progress must match metres per second');
  assert.ok(Math.abs((v - u) * distance - dt * enemy.travelSpeed) < 1e-8);
}
// Full flock motion includes small local swerves but must not scale in speed
// with flock size or preserve the previous high-frequency mosquito zigzags.
const instantaneous = (enemy, t, dt = 0.05) => {
  const a = swarmFrame([enemy], t)[0].p;
  const b = swarmFrame([enemy], t + dt)[0].p;
  return Math.hypot(...a.map((x, i) => x - b[i])) / dt;
};
for (const enemy of [small[0], big[0], huge[0], children[0], mixed.find((e) => e.type === 'mosquito')]) {
  const t = enemy.spawn + enemy.entryHold + (enemy.duration - enemy.entryHold) * 0.45;
  const speed = instantaneous(enemy, t);
  assert.ok(speed < 1.6 * enemy.travelSpeed, enemy.type + ' effective speed: ' + speed);
}
assert.equal(small[0].travelSpeed, huge[0].travelSpeed);
console.log('Speeds: independent of creature size, wave, route length and swarm population.');
