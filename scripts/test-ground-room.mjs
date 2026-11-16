import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';

let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'GROUND', name: 'A' });
const b = game.join({ code: 'GROUND', name: 'B' });
const other = game.join({ code: 'ANOTHER', name: 'Autre salle' });
const r = game.rooms.get('GROUND');
r.dollars = 20;
const foot = (id, x, z) => {
  const player = r.pilots.get(id);
  const body = game.base(r, player);
  assert.ok(body, 'ground body must exist');
  body.x = (x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT;
  body.z = (OFFICE_LAYOUT.base.originZ - z) / ACTOR_UNIT;
  body.y = 0.0007;
  body.grounded = true;
  body.parachute = false;
};
const action = (id, command) =>
  game.command('GROUND', id, 'ground-defense', { epoch: r.base.epoch, ...command });
foot(a.id, 0, 0);
foot(b.id, 0, 0);
let reply = action(a.id, { action: 'build', kind: 'barricade', a: [0, 0], b: [0.4, 0] });
assert.equal(reply.dollars, 17.94);
assert.equal(reply.groundDefense.structures.length, 9);
assert.equal(reply.groundDefense.navigationRevision, 1);
const second = game.command('GROUND', b.id, 'sync', {
  state: r.pilots.get(b.id).state,
  mode: r.pilots.get(b.id).mode,
});
assert.deepEqual(
  second.groundDefense,
  reply.groundDefense,
  'another player observes same constructions',
);
const anotherRoom = game.rooms.get('ANOTHER');
assert.equal(
  game.command('ANOTHER', other.id, 'sync', {
    state: anotherRoom.pilots.get(other.id).state,
    mode: anotherRoom.pilots.get(other.id).mode,
  }).groundDefense.structures.length,
  0,
);
assert.throws(
  () => action(b.id, { action: 'build', kind: 'barricade', a: [0, 0], b: [0.4, 0] }),
  /occupé/,
);
assert.equal(r.dollars, 17.94, 'rejected simultaneous placement cannot spend shared money');
assert.throws(
  () => action(a.id, { action: 'damage', id: reply.groundDefense.structures[0].id }),
  /inconnue/,
);
assert.throws(() => action(a.id, { action: 'build', kind: 'sugar', a: [3, 3] }), /proximité/);
assert.throws(
  () => action(a.id, { action: 'build', kind: 'sugar', a: [0, 0], epoch: 'stale' }),
  /changé/,
);
reply = action(a.id, { action: 'build', kind: 'sugar', a: [0, 0.1] });
assert.equal(reply.dollars, 14.94);
assert.equal(reply.groundDefense.structures.at(-1).kind, 'sugar');
assert.equal(reply.groundDefense.structures.at(-1).radius, 0.15);
const epoch = r.base.epoch;
game.command('GROUND', a.id, 'reset', { epoch });
assert.equal(r.groundDefense.structures.length, 0);
assert.equal(r.dollars, r.balance.startingMoney);
assert.notEqual(r.base.epoch, epoch);
assert.throws(
  () =>
    game.command('GROUND', a.id, 'ground-defense', {
      epoch,
      action: 'build',
      kind: 'sugar',
      a: [0, 0],
    }),
  /changé/,
);
console.log(
  'PASS: ground room state, shared placement, collision and cost authority, reset and stale epoch.',
);
