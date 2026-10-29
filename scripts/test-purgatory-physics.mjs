import assert from 'node:assert/strict';
import {
  createSoul,
  advanceArena,
  deskOccupant,
  bodyMotion,
  relayBodyReport,
} from '../src/purgatory-physics.js';
const make = (id, x = 0, z = 8) => ({
  ...createSoul({ id, entity: 'p' + id, kind: 'player' }, 0, 1000),
  x,
  z,
});
let a = { time: 1000, events: [], bodies: [make(1), make(2)] };
advanceArena(a, 1050);
assert.ok(Math.hypot(a.bodies[0].x - a.bodies[1].x, a.bodies[0].z - a.bodies[1].z) > 0.95);
a = { epoch: 'e', time: 1000, events: [], bodies: [make(1, 0, 1.1), make(2, 0, 4)] };
assert.equal(deskOccupant(a).id, 1);
a.bodies[0].x = 5;
assert.equal(deskOccupant(a), null);
const b = a.bodies[1];
b.input = { x: 1, z: 0 };
b.inputAt = a.time;
advanceArena(a, 1400);
const speed = Math.hypot(b.vx, b.vz);
advanceArena(a, 1900);
assert.ok(Math.hypot(b.vx, b.vz) < speed);
// Retired melee reports cannot restore a guard, KO or attack.
const m = {
  ...bodyMotion(b),
  koUntil: 999999,
  input: { x: 0, z: 0, guard: true },
  attack: { start: 1900, hits: [], heavy: true },
};
relayBodyReport(a, b, { epoch: 'e', body: m, impacts: [{ kind: 'ko', seq: 1 }] }, 1900);
assert.equal(b.attack, null);
assert.equal(b.koUntil, 0);
assert.equal(b.input.guard, false);
assert.equal(a.events.length, 0);
console.log(
  'PASS: physical separation, desk access, stale-input braking and obsolete combat reports ignored.',
);
