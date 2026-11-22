import assert from 'node:assert/strict';
import { stepHeavy } from '../src/heavy-sim.js';
import { proximityRadius } from '../src/mobile-flak.js';
import { MAX_ORDNANCE } from '../server/game.js';

// Heavy shots hit the props' triangles through world.decorRay (a ray along each
// step), like any bullet; the boxes marked `decor` are then left out.
assert.ok(MAX_ORDNANCE >= 10_000, 'room limit raised for many projectiles');
const wall = { x: [0.5, 0.52] }; // a thin vertical sheet at x = 0.5
const decorRay = (a, b) => {
  const length = b[0] - a[0];
  if (length <= 0 || a[0] > wall.x[0] || b[0] < wall.x[0]) return null;
  return (wall.x[0] - a[0]) / length;
};
const world = (extra = {}) => ({
  solids: [],
  roster: [],
  killed: () => false,
  frames: () => [],
  vehicles: [],
  players: [],
  equipment: [],
  ...extra,
});
const shell = () => ({
  weapon: 'antitank',
  p: [0, 1, 0],
  v: [30, 0, 0],
  at: 0,
  updated: 0,
  age: 0,
  bonus: 1,
  shooter: 'a',
  vehicle: null,
});
const miss = shell();
assert.equal(stepHeavy(miss, 60, world()), null, 'no decor ray: flies through');
const hit = shell();
const impact = stepHeavy(hit, 60, world({ decorRay }));
assert.ok(impact?.hit.solid, 'the sheet stops the shell');
assert.ok(Math.abs(impact.point[0] - 0.5) < 1e-6, 'at the triangle, not past it');

// Proximity fuse: armed, it fires at the closest approach to a prop's triangles
// (here a post), i.e. as it moves away, never before nor on boxes.
const fuse = () => ({ ...shell(), weapon: 'proximity', proximity: 3, v: [20, 0, 0], p: [0, 1, 0] });
const probe = fuse();
stepHeavy(probe, 700, world()); // where it flies unobstructed (gravity included)
const at = probe.p;
const post = [at[0] - 0.4, at[1] + 0.0005, at[2] + 0.004]; // missed by ~4 mm (radius 9 mm)
const decorNearest = (p, radius) => {
  const d = Math.hypot(p[0] - post[0], p[1] - post[1], p[2] - post[2]);
  return d <= radius ? d : null;
};
const near = fuse();
const bang = stepHeavy(near, 700, world({ decorNearest }));
assert.ok(bang && near.done, 'fuse fired');
assert.ok(near.p[0] > post[0] - 0.02, 'not before the closest approach');
assert.ok(near.p[0] - post[0] < proximityRadius(3), 'as it moves away, inside the radius');
const far = fuse();
assert.equal(stepHeavy(far, 700, world({ decorNearest: () => null })), null, 'nothing in range');
console.log('test-heavy-decor ok');
