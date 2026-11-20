// Deformable tank tracks: belts cut finely enough to bend, wheels and belts that follow the
// terrain under them, unchanged on flat ground.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { tessellate } from '../src/tessellate.ts';
import { AXLE_Z, TRACK_HALF } from '../src/tank-gear.ts';
import { vehicleUnit } from '../src/fleet.ts';
import {
  axleOffsets,
  beltDisplacement,
  updateSuspension,
  WHEEL_TRAVEL,
} from '../src/track-suspension.ts';

// Tessellation: long edges split, area and UV mapping kept, no crack (shared edges).
const mesh = {
  positions: Float32Array.of(0, 0, 0, 4, 0, 0, 0, 0, 1, 4, 0, 1),
  uv: Float32Array.of(0, 0, 1, 0, 0, 1, 1, 1),
  indices: Uint16Array.of(0, 2, 1, 1, 2, 3),
};
const cut = tessellate(mesh, 1);
const area = (m) => {
  let sum = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.indices[t + k] * 3);
    const u = [0, 1, 2].map((k) => m.positions[b + k] - m.positions[a + k]),
      v = [0, 1, 2].map((k) => m.positions[c + k] - m.positions[a + k]);
    sum +=
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) /
      2;
  }
  return sum;
};
assert.ok(Math.abs(area(cut) - 4) < 1e-5, 'same surface');
for (let i = 0; i < cut.positions.length / 3; i++)
  assert.ok(Math.abs(cut.uv[2 * i] - cut.positions[3 * i] / 4) < 1e-6, 'uv follows the position');
let longest = 0;
for (let t = 0; t < cut.indices.length; t += 3)
  for (let k = 0; k < 3; k++) {
    const a = cut.indices[t + k] * 3,
      b = cut.indices[t + ((k + 1) % 3)] * 3;
    longest = Math.max(
      longest,
      Math.hypot(...[0, 1, 2].map((j) => cut.positions[a + j] - cut.positions[b + j])),
    );
  }
assert.ok(longest <= 1 + 1e-6, 'edges at most 1: ' + longest);

// Terrain: flat ground gives no offset; a block under one axle raises only it.
const unit = vehicleUnit('tank');
const hull = [0, 0.8 * unit, 0];
const flat = axleOffsets([], hull, 0, -1, TRACK_HALF, unit, 0.8);
assert.ok(
  flat.every((v) => v === 0),
  'flat ground',
);
const block = {
  min: { x: -5, y: 0, z: AXLE_Z[2] * unit - 0.1 * unit },
  max: { x: 5, y: 0.1 * unit, z: AXLE_Z[2] * unit + 0.1 * unit },
};
const bumped = axleOffsets([block], hull, 0, -1, TRACK_HALF, unit, 0.8);
assert.ok(Math.abs(bumped[2] - 0.1) < 1e-6, 'bump under the third axle ' + bumped[2]);
assert.equal(bumped[0], 0);
const high = { ...block, max: { ...block.max, y: 5 * unit } };
assert.equal(
  axleOffsets([high], hull, 0, -1, TRACK_HALF, unit, 0.8)[2],
  0,
  'a wall is not a floor',
);
// A hull far above the ground lets the wheels hang.
assert.equal(axleOffsets([], [0, 3 * unit, 0], 0, 1, TRACK_HALF, unit, 0.8)[0], -WHEEL_TRAVEL);

// Belt displacement: the bottom run follows, the top run stays; linear between axles.
assert.equal(
  beltDisplacement(
    AXLE_Z.map(() => 0.1),
    0.4,
    0,
  ),
  0,
  'top run',
);
assert.ok(
  Math.abs(
    beltDisplacement(
      AXLE_Z.map(() => 0.1),
      -0.7,
      0,
    ) - 0.1,
  ) < 1e-9,
  'bottom run',
);
const offsets = AXLE_Z.map((_, i) => (i === 1 ? 0.1 : 0));
const mid = (AXLE_Z[0] + AXLE_Z[1]) / 2;
assert.ok(Math.abs(beltDisplacement(offsets, -0.7, mid) - 0.05) < 1e-9, 'halfway between axles');

// The model: own belt geometry, flat ground leaves the rest pose, a bump bends belt and wheel.
const g = createGraphics(T, new T.Scene()).makeTank('#8eb7c6');
const { tracks, suspension } = g.userData;
for (const node of tracks) {
  const geometry = node.children.find((c) => c.isMesh).geometry;
  assert.ok(geometry.getAttribute('position').count > 400, 'finely cut belt');
}
g.scale.setScalar(unit);
g.position.set(0, 0.8 * unit, 0);
const top = (node) =>
  Math.max(
    ...Array.from(
      node.children.find((c) => c.isMesh).geometry.getAttribute('position').array,
    ).filter((_, i) => i % 3 === 1),
  );
const bottomSum = (node) => {
  const a = node.children.find((c) => c.isMesh).geometry.getAttribute('position').array;
  let sum = 0;
  for (let i = 1; i < a.length; i += 3) sum += a[i];
  return sum;
};
const before = bottomSum(tracks[0]),
  restY = suspension.rest.map((r) => r.slice());
updateSuspension(g, suspension, tracks, [], TRACK_HALF, 1);
assert.equal(bottomSum(tracks[0]), before, 'flat ground leaves the belt as modelled');
const step = {
  min: { x: -5, y: 0, z: AXLE_Z[2] * unit - 0.1 * unit },
  max: { x: 5, y: 0.1 * unit, z: AXLE_Z[2] * unit + 0.1 * unit },
};
for (let i = 0; i < 60; i++) updateSuspension(g, suspension, tracks, [step], TRACK_HALF, 1 / 60);
assert.ok(bottomSum(tracks[0]) > before, 'the belt is pushed up');
assert.ok(top(tracks[0]) < 1, 'finite');
assert.ok(
  Math.abs(suspension.axles[2][0].position.y - restY[2][0] - 0.1) < 0.01,
  'the wheel rides the bump',
);
assert.equal(suspension.axles[0][0].position.y, restY[0][0], 'other axles stay');
console.log('track suspension ok');
