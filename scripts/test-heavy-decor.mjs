import assert from 'node:assert/strict';
import { stepHeavy } from '../src/heavy-sim.js';
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
console.log('test-heavy-decor ok');
