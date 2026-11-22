// Camera clearance: a chase camera stops before the first obstacle between the followed
// point and the wanted eye, and never ends behind a solid.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLEARANCE_MARGIN, CLEARANCE_MIN, clearEye } from '../src/camera-clearance.ts';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const target = { x: 1, y: 2, z: 3 };
const wanted = { x: 1, y: 2, z: 13 }; // 10 behind
const wall = (distance) => (_o, _d, far) => (distance <= far ? distance : Infinity);

// Free way: the eye is untouched (and is a copy).
const free = clearEye(target, wanted, wall(Infinity));
assert.deepEqual(free, wanted);
assert.notEqual(free, wanted);
// Obstacle beyond the eye: untouched too.
assert.deepEqual(clearEye(target, wanted, wall(10.5)), wanted);
// Wall at 4: the eye stops just before it, on the same line.
const pulled = clearEye(target, wanted, wall(4));
near(pulled.x, 1);
near(pulled.y, 2);
near(pulled.z, 3 + 4 - CLEARANCE_MARGIN * 10);
// Wall right at the vehicle (a box around it): the eye keeps a minimum distance, never zero.
const pressed = clearEye(target, wanted, wall(0.1));
near(pressed.z, 3 + CLEARANCE_MIN * 10);
assert.ok(pressed.z > target.z);
// The ray starts at the target and looks towards the eye, over the whole segment.
let seen;
clearEye(target, { x: 1, y: 8, z: 3 }, (origin, direction, far) => {
  seen = { origin, direction, far };
  return Infinity;
});
assert.deepEqual(seen.origin, target);
near(seen.direction.y, 1);
near(seen.far, 6);
// Degenerate: eye on the target, no ray.
assert.deepEqual(
  clearEye(target, target, () => assert.fail('no ray for a zero-length segment')),
  target,
);
// Diagonal: the direction is a unit vector and the result stays on the segment.
const d = clearEye({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, (_o, dir, far) => {
  near(Math.hypot(dir.x, dir.y, dir.z), 1);
  return 2;
});
near(Math.hypot(d.x, d.y, d.z), 2 - CLEARANCE_MARGIN * 5);
near(d.y / d.x, 4 / 3);

// Wiring: every chase camera and the on-foot camera go through the clearance.
const client = readFileSync('src/client.js', 'utf8');
assert.equal((client.match(/followClear\(/g) ?? []).length, 3, 'definition + two chase cameras');
assert.match(client, /clearEye\(target, cam\.position, cast\)/, 'on foot: after the easing');
console.log('Camera clearance: eye pulled before the first obstacle, minimum distance, wiring.');
