import assert from 'node:assert/strict';
import { stepHeavy } from '../src/heavy-sim.js';
import { solidView } from './solid-harness.mjs';
import { MAX_BOUNCES } from '../src/ricochet.ts';
import { MAP } from '../src/scale.ts';

// Shells with a ricochet angle (ap 10°, he 5°) bounce on the floor in the heavy simulation, as
// bullets do; the others explode as before. The shooter notes each bounce for the server.
const world = (extra = {}) => ({
  ...solidView([]),
  roster: [],
  killed: () => false,
  frames: () => [],
  vehicles: [],
  players: [],
  equipment: [],
  ...extra,
});
const deg = (a) => (a * Math.PI) / 180;
const shell = (weapon, angle, speed = MAP.metres(300)) => ({
  weapon,
  p: [0, MAP.metres(3), 0],
  v: [0, -Math.sin(deg(angle)) * speed, -Math.cos(deg(angle)) * speed],
  at: 0,
  updated: 0,
  age: 0,
  bonus: 1,
  shooter: 'a',
  vehicle: null,
});
const flight = (projectile, ms = 500) => {
  const impact = stepHeavy(projectile, ms, world());
  return impact;
};

// A grazing armour-piercing shell skids off the floor and flies on, turned and slowed.
const ap = shell('ap', 4);
assert.equal(flight(ap, 400), null, 'no impact: it bounced');
assert.ok(!ap.done);
assert.equal(ap.skids.length >= 1, true, 'the shooter has a bounce to report');
assert.equal(ap.bounces, ap.skids.length);
const first = ap.skids[0];
assert.ok(first.v[1] > 0, 'going up after the floor');
assert.ok(first.v[2] < 0, 'still forward');
assert.ok(first.at[1] < 1e-6 + 0.01, 'at the floor');
assert.ok(Math.hypot(...first.v) < Math.hypot(...shell('ap', 4).v), 'it lost speed to the bounce');

// A steep one explodes/hits as before.
const steep = shell('ap', 30);
assert.ok(flight(steep, 400), 'steep armour-piercing shell hits the floor');
assert.equal(steep.done, true);
assert.equal(steep.skids, undefined);

// The explosive shell's limit is 5°: 4° bounces, 7° hits.
assert.equal(flight(shell('he', 4), 100), null);
assert.ok(flight(shell('he', 7), 400));

// Rockets, bombs and the like never skid, however shallow.
for (const weapon of ['rocket', 'antitank'])
  assert.ok(flight(shell(weapon, 2), 800), weapon + ' hits the floor');

// At most five bounces: the next contact ends the shell without an impact.
const long = { ...shell('ap', 4), p: [0, MAP.metres(3), 0] };
let ended = 0;
for (let t = 500; t <= 20000 && !long.done; t += 500) {
  assert.equal(stepHeavy(long, t, world()), null, 'never an impact while skidding');
  ended = t;
}
assert.equal(long.done, true, 'it ends');
assert.equal(long.bounces, MAX_BOUNCES, 'it skids five times, then the sixth contact ends it');
console.log(
  'PASS: heavy shells skid on the floor within their angle, hit above it, end after five bounces.',
);
