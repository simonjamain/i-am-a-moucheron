// The starter vehicles are born in the room's physics world, settle on the pad, sleep, and the
// pad never refills in a loop (server/game.js: fleet, advanceParked).
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { MAP } from '../src/scale.ts';

let now = 100000;
const game = new Game({ now: () => now });
const player = game.join({ code: 'PAD', name: 'Pilote' });
const room = game.rooms.get('PAD');
const tick = (ms = 50) => {
  now += ms;
  room.pilots.get(player.id).seen = now;
  game.advance(room);
};
const starters = () => [...room.vehicles.values()].filter((v) => v.origin === 'starter');
const types = () =>
  starters()
    .map((v) => v.type)
    .sort();
assert.deepEqual(types(), ['bomber', 'fighter', 'tank'], 'the three starters');
assert.ok(
  starters().every((v) => v.hosted),
  'born simulated by the server',
);
const home = new Map(starters().map((v) => [v.id, [...v.state.p]]));

// The engine loads asynchronously: step until every starter is asleep.
const asleep = () =>
  room.parkedHost &&
  starters().every((v) => room.parkedHost.has(v.id) && room.parkedHost.asleep(v.id));
for (let i = 0; i < 600 && !asleep(); i++) {
  tick();
  if (i < 100) await new Promise((r) => setTimeout(r, 5));
}
assert.ok(asleep(), 'they settle and fall asleep by themselves');
for (let i = 0; i < 1200; i++) tick(); // a minute more
assert.equal(starters().length, 3, 'nothing refilled the pad');
for (const v of starters()) {
  assert.ok(v.ready, v.type + ' still ready');
  assert.ok(v.state.hp > 0, v.type + ' undamaged');
  const [x, y, z] = home.get(v.id);
  assert.ok(
    Math.hypot(v.state.p[0] - x, v.state.p[2] - z) < MAP.metres(1.5),
    v.type + ' stayed on the pad',
  );
  assert.ok(Math.abs(v.state.p[1] - y) < MAP.metres(1.5), v.type + ' at pad height');
}

// A starter that leaves the pad (destroyed) is replaced, but never faster than the gap.
let created = 0;
const create = game.createVehicle.bind(game);
game.createVehicle = (...args) => {
  created++;
  return create(...args);
};
for (let round = 0; round < 40; round++) {
  const live = starters().filter((v) => v.type === 'tank' && v.ready && v.state.hp > 0);
  for (const v of live) {
    v.state.hp = 0;
    v.ready = 0;
  }
  tick(1000);
  game.fleet(room);
}
// 40 s: the first replacement at once, then one every 10 s at most.
assert.ok(created <= 5, `replacements are rate-limited (${created} in 40 s)`);
assert.ok(created >= 1, 'a destroyed starter is replaced');
console.log('test-start-pad ok');
