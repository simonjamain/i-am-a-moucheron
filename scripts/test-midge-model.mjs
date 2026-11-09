// Meshy midge: provenance, added wing bones, procedural flight cycle and its
// vertex animation bake (src/midge-model.js, src/midge-batch.js).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MIDGE_DATA } from '../src/midge-data.js';
import {
  createMidgeRig,
  bakeFlight,
  flightPose,
  MIDGE_FLIGHT,
  MIDGE_BONES,
} from '../src/midge-model.js';
import { MIDGE_SPHERE_RADIUS } from '../src/scale.js';

const world = (o) => o.getWorldPosition(new T.Vector3());

// 1. Data: approved source, 38 Meshy bones + 2 wing bones, each wing rigid.
assert.equal(
  MIDGE_DATA.source.sha256,
  '5db0deca500732e4980bea1daf16fc412d5ed04aaeaf26cf73c0de7bd81bf404',
);
assert.equal(MIDGE_DATA.bones.length, 40);
assert.deepEqual(
  MIDGE_DATA.source.addedWingBones.map((w) => w.bone),
  MIDGE_BONES.wings,
);
for (const name of Object.values(MIDGE_BONES).flat(2))
  assert.ok(
    MIDGE_DATA.bones.some((b) => b.name === name),
    name,
  );
const joints = Uint8Array.from(atob(MIDGE_DATA.joints), (c) => c.charCodeAt(0));
const weights = Uint8Array.from(atob(MIDGE_DATA.weights), (c) => c.charCodeAt(0));
for (let v = 0; v < joints.length / 4; v++)
  assert.equal(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3], 255);
for (const [k, wing] of MIDGE_DATA.source.addedWingBones.entries()) {
  let count = 0;
  for (let v = 0; v < joints.length / 4; v++)
    if (joints[v * 4] === 38 + k) {
      count++;
      assert.equal(weights[v * 4], 255, 'wing vertices follow only their bone');
    }
  assert.equal(count, wing.vertices);
  assert.ok(Math.sign(wing.hinge[0]) === (k ? -1 : 1), 'Wing_L on +X (fly faces +Z)');
}

// 2. Rig: presentation head towards -Z (client heading), body inside the hit sphere.
const rig = createMidgeRig(T);
const box = new T.Box3().setFromObject(rig.container);
const size = box.getSize(new T.Vector3());
assert.ok(size.z > 1.6 && size.z < 2.3, 'body length ' + size.z);
assert.ok(box.getCenter(new T.Vector3()).length() < 0.6, 'thorax near the origin');
assert.ok(
  world(rig.bones[MIDGE_BONES.head]).z < world(rig.bones.Bone_005).z - 0.5,
  'head forward (-Z), abdomen behind',
);
assert.ok(MIDGE_SPHERE_RADIUS > size.z / 2, 'hit sphere covers the body');

// 3. Flight cycle: periodic loop, symmetric wing beat with the right amplitude.
const positions = new Float32Array(
  Uint8Array.from(atob(MIDGE_DATA.positions), (c) => c.charCodeAt(0)).buffer,
);
// Wing tip: farthest vertex of the wing shell from its hinge, carried by the bone.
const tipVertex = MIDGE_DATA.source.addedWingBones.map((wing, k) => {
  const hinge = new T.Vector3().fromArray(wing.hinge);
  let best = hinge;
  for (let v = 0; v < joints.length / 4; v++) {
    const p = new T.Vector3().fromArray(positions, v * 3);
    if (joints[v * 4] === 38 + k && p.distanceTo(hinge) > best.distanceTo(hinge)) best = p;
  }
  return best.sub(hinge);
});
const span = (side, t) => {
  rig.pose(t);
  const bone = rig.bones[MIDGE_BONES.wings[side]];
  return tipVertex[side].clone().applyMatrix4(bone.matrixWorld).sub(world(bone)).normalize();
};
const top = span(0, 0),
  bottom = span(0, 0.5 / MIDGE_FLIGHT.beats);
assert.ok(top.y > 0.6, 'wing raised at the top of the stroke: ' + top.y);
assert.ok(bottom.y < 0.15, 'wing lowered at the bottom of the stroke: ' + bottom.y);
for (const t of [0, 0.03, 0.31]) {
  const left = span(0, t),
    right = span(1, t);
  assert.ok(Math.abs(left.y - right.y) < 0.15 && Math.abs(left.z - right.z) < 0.15, 'symmetric');
}
// Forward flight: the tip is ahead of its mean on the downstroke and behind on
// the upstroke (pushes air backwards). Seen from the side (forward, up), the
// tip loop runs clockwise: negative shoelace area. Head is -Z after presentation.
for (const side of [0, 1]) {
  const path = [];
  for (let i = 0; i < 48; i++) {
    const d = span(side, i / 48 / MIDGE_FLIGHT.beats);
    path.push([-d.z, d.y]);
  }
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const [x1, y1] = path[i],
      [x2, y2] = path[(i + 1) % path.length];
    area += x1 * y2 - x2 * y1;
  }
  assert.ok(area < -0.05, 'wing beat drives forward flight (side ' + side + '): ' + area);
}
const q0 = flightPose(T, 0),
  q1 = flightPose(T, 1);
for (const [name, p] of Object.entries(q0))
  assert.ok(p.rotation.angleTo(q1[name].rotation) < 1e-6, 'loop closes: ' + name);
assert.equal(MIDGE_FLIGHT.frames, MIDGE_FLIGHT.beats * MIDGE_FLIGHT.framesPerBeat);
assert.ok(MIDGE_FLIGHT.beats / MIDGE_FLIGHT.loop >= 5, 'buzzing wing beat');

// 4. Bake: wings move a lot between frames, the body only a little; the last
// frame leads smoothly back into the first.
const bake = bakeFlight(T);
assert.equal(bake.positions.length, bake.frames * bake.count * 3);
const move = (a, b, filter) => {
  let max = 0;
  for (let v = 0; v < bake.count; v++) {
    if (!filter(v)) continue;
    let d = 0;
    for (let k = 0; k < 3; k++)
      d +=
        (bake.positions[(a * bake.count + v) * 3 + k] -
          bake.positions[(b * bake.count + v) * 3 + k]) **
        2;
    max = Math.max(max, Math.sqrt(d));
  }
  return max;
};
const isWing = (v) => joints[v * 4] >= 38;
const half = MIDGE_FLIGHT.framesPerBeat / 2;
assert.ok(move(0, half, isWing) > 0.6, 'wing tips sweep through the stroke');
assert.ok(move(0, half, (v) => !isWing(v)) < 0.25, 'body stays steady');
const step = move(0, 1, isWing);
assert.ok(move(bake.frames - 1, 0, isWing) < step * 1.5, 'seamless loop');
for (let i = 0; i < bake.normals.length; i += 3)
  assert.ok(
    Math.abs(Math.hypot(bake.normals[i], bake.normals[i + 1], bake.normals[i + 2]) - 1) < 1e-3,
  );

console.log(
  JSON.stringify({
    triangles: MIDGE_DATA.source.triangles,
    bones: MIDGE_DATA.bones.length,
    frames: bake.frames,
    vatHalfFloatBytes: 2 * bake.frames * bake.count * 4 * 2,
  }),
);
console.log(
  'PASS: Meshy midge provenance, rigid wing bones, head forward, periodic symmetric wing beat and seamless VAT bake.',
);
