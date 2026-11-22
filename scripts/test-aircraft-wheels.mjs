// poseWheels (src/aircraft-wheels.ts) lifts the wheels registered by rigWheels, and only those.
// A model whose userData.wheels is something else (the Castor's six wheel groups, animated by
// castor-wheels.ts) must come out untouched: its wheels used to vanish (NaN position) as soon as
// another player drove it or it was parked.
import assert from 'node:assert/strict';
import { poseWheels, parkedCompression, rigWheels } from '../src/aircraft-wheels.ts';
import { planeSpec } from '../src/plane-physics.ts';

const node = (y) => ({ position: { x: 1, y, z: 2 }, rotation: { x: 0 }, userData: {} });

// A rigged aircraft: wheels rise with the springs' compression and parked springs sag.
const plane = { userData: {} };
const left = node(0.5),
  right = node(0.5);
rigWheels(plane, { wheelL: left, wheelR: right }, 'fighter');
assert.equal(left.userData.restY, 0.5);
poseWheels(plane, parkedCompression(plane, false));
assert.equal(left.position.y, 0.5, 'flying: wheels at rest height');
const sag = planeSpec('fighter').sag;
poseWheels(plane, parkedCompression(plane, true));
assert.ok(Number.isFinite(left.position.y) && Number.isFinite(right.position.y));
assert.equal(left.position.y === 0.5, sag === 0, 'parked: wheels follow the sag');

// The Castor: six wheel groups with no rest height, left alone.
const castor = { userData: { wheels: Array.from({ length: 6 }, (_, i) => node(0.1 * i)) } };
poseWheels(castor, parkedCompression(castor, true));
poseWheels(castor, parkedCompression(castor, false));
castor.userData.wheels.forEach((wheel, i) => {
  assert.equal(wheel.position.y, 0.1 * i, 'castor wheel ' + i + ' keeps its height');
  assert.ok(!('restY' in wheel.userData));
});
console.log('Aircraft wheels: rigged wheels follow the springs, other wheel sets are not touched.');
