// Meshy rat: provenance, its own walking clip replayed through pose deltas,
// paws on the ground lift, stride matching the planted paws, ellipsoid hits,
// distance-driven proxy and VAT bake (src/rat-model.js, scripts/import-rat.py).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { RAT_DATA } from '../src/rat-data.js';
import { RAT, RAT_BONES, RAT_HIT, RAT_MODEL, ratClipWorld, ratWorld } from '../src/rat-model.js';
import { WALKERS, WalkerBatch, walkerStride } from '../src/walker-batch.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit } from '../src/insect-hits.ts';
import { GROUND_FOOT_DEPTH, GROUND_FOOT_CLEARANCE, INSECT_SCALE } from '../src/scale.ts';
import { insectScale } from '../src/insect-status.ts';

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const floor = -GROUND_FOOT_DEPTH + GROUND_FOOT_CLEARANCE - RAT_MODEL.sink;

// 1. Data: approved source, skeleton, clip of 30 keys over 1 s.
assert.equal(
  RAT_DATA.source.sha256,
  'fa7bf0c888f267fea959c05f16d87f6a7cb406baaafcb35a02cc6029f3683eae',
);
assert.equal(RAT_DATA.bones.length, 27);
assert.equal(RAT_DATA.clip.frames, 30);
assert.equal(RAT_DATA.source.clipSeconds, 1);
for (const name of [RAT_BONES.root, RAT_BONES.head, ...RAT_BONES.tail, ...RAT_BONES.paws.flat()])
  assert.ok(
    RAT_DATA.bones.some((b) => b.name === name),
    name,
  );
assert.ok(WALKERS.rat.clip && WALKERS.rat.creature === RAT);
const joints = bytes(RAT_DATA.joints),
  weights = bytes(RAT_DATA.weights);
for (let v = 0; v < joints.length / 4; v++)
  assert.equal(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3], 255);

// 2. The posed rig reproduces the clip (with the hind toe fix): every bone
// lands on its model-space transform (presentation applied), between keys too.
const rig = RAT.createRig(T);
const presentation = rig.rig.matrix.clone();
const turn = new T.Quaternion().setFromRotationMatrix(
  new T.Matrix4().extractRotation(presentation),
);
for (const t of [0, 0.25, 0.517, 0.9]) {
  rig.pose(t);
  rig.container.updateMatrixWorld(true);
  const clip = ratWorld(T, t);
  RAT_DATA.bones.forEach((bone, i) => {
    const expected = clip[i].p.clone().applyMatrix4(presentation);
    const actual = rig.bones[bone.name].getWorldPosition(new T.Vector3());
    assert.ok(actual.distanceTo(expected) < 1e-3, bone.name + ' position at ' + t);
    const q = rig.bones[bone.name].getWorldQuaternion(new T.Quaternion());
    const r = turn.clone().multiply(clip[i].q);
    assert.ok(q.angleTo(r) < 2e-3, bone.name + ' rotation at ' + t);
  });
}
// Loop: phase 1 is phase 0.
const a = RAT.pose(T, 0),
  b = RAT.pose(T, 1);
for (const [name, p] of Object.entries(a))
  assert.ok(p.rotation.angleTo(b[name].rotation) < 1e-3, 'loop closes: ' + name);

// 3. Shape: head towards -Z, body centred on the proxy, tail behind, size of
// the old rat (about 4.4 units with the tail).
rig.pose(RAT.rest);
rig.container.updateMatrixWorld(true);
const world = (name) => rig.bones[name].getWorldPosition(new T.Vector3());
assert.ok(world(RAT_BONES.head).z < world(RAT_BONES.tail[4]).z - 2, 'head forward (-Z)');
const box = new T.Box3().setFromObject(rig.container);
const size = box.getSize(new T.Vector3());
assert.ok(size.z > 3.8 && size.z < 5, 'length ' + size.z);

// 4. Bake: the hind soles touch the shared ground lift. The front paws keep
// the clip, whose toes point down at lift-off: they may dip a little under
// the lift, never deeper than RAT_MODEL.toeDip. The planted hind paws move
// back at the stride speed, so feet do not slide when the phase follows the
// distance.
const bake = RAT.bake(T);
assert.equal(bake.frames, RAT_MODEL.frames);
const N = bake.frames,
  C = bake.count;
let minY = Infinity;
for (let i = 1; i < bake.positions.length; i += 3) minY = Math.min(minY, bake.positions[i]);
assert.ok(minY > floor - RAT_MODEL.toeDip, 'front toes dip at most toeDip ' + minY);
const lowest = (bones) => {
  const set = new Set(bones.map((n) => RAT.boneIndex(n)));
  const ys = [];
  for (let f = 0; f < N; f++) {
    let low = Infinity;
    for (let v = 0; v < C; v++)
      if (set.has(joints[v * 4])) low = Math.min(low, bake.positions[(f * C + v) * 3 + 1]);
    ys.push(low);
  }
  return ys;
};
for (const chain of RAT_BONES.paws.slice(2)) {
  const ys = lowest(chain.slice(1));
  assert.ok(Math.abs(Math.min(...ys) - floor) < 0.03, chain[0] + ' sole on the lift ' + ys);
  assert.ok(Math.min(...ys) > floor - 0.03, chain[0] + ' toe fixed above the floor');
}
const speeds = [];
for (const chain of RAT_BONES.paws.slice(2)) {
  const toe = RAT.boneIndex(chain[3]);
  const ys = [],
    zs = [];
  for (let f = 0; f < N; f++) {
    const p = ratClipWorld(T, f / N)[toe].p;
    ys.push(p.y);
    zs.push(p.z);
  }
  const low = Math.min(...ys);
  assert.ok(Math.max(...ys) - low > 0.025, chain[3] + ' lifts');
  for (let f = 0; f < N; f++) {
    const g = (f + 1) % N;
    const back = (zs[f] - zs[g]) * N; // model faces +Z: planted paws move to -Z
    if (ys[f] < low + 0.02 && ys[g] < low + 0.02 && back > 0.1) speeds.push(back);
  }
}
speeds.sort((x, y) => x - y);
const median = speeds[speeds.length >> 1];
assert.ok(speeds.length >= 6, 'planted samples ' + speeds.length);
assert.ok(
  Math.abs(median - RAT_MODEL.stride) < RAT_MODEL.stride * 0.15,
  'stride matches the planted paws: ' + median,
);
// The toe fix stays on the hind toes and only ever lifts them.
for (let f = 0; f < N; f++) {
  const raw = ratClipWorld(T, f / N),
    fixed = ratWorld(T, f / N);
  RAT_DATA.bones.forEach((bone, i) => {
    const toe = RAT_BONES.paws.slice(2).some((chain) => chain[3] === bone.name);
    if (!toe) assert.ok(raw[i].q.equals(fixed[i].q), bone.name + ' untouched');
  });
}

// 5. Hit volume: head and body (no tail, no paws) in the ellipsoid.
const skip = new Set(
  [...RAT_BONES.tail, ...RAT_BONES.paws.flatMap((c) => c.slice(1))].map((n) => RAT.boneIndex(n)),
);
const body = [];
for (let v = 0; v < C; v++) if (!skip.has(joints[v * 4])) body.push(v);
const [cx, cy, cz] = RAT_HIT.centre,
  [rx, ry, rz] = RAT_HIT.radii;
let inside = 0,
  tolerant = 0,
  total = 0;
for (let f = 0; f < N; f += 5)
  for (const v of body) {
    const o = (f * C + v) * 3;
    const l =
      ((bake.positions[o] - cx) / rx) ** 2 +
      ((bake.positions[o + 1] - cy) / ry) ** 2 +
      ((bake.positions[o + 2] - cz) / rz) ** 2;
    total++;
    if (l <= 1) inside++;
    if (l <= 1.25 ** 2) tolerant++;
  }
assert.ok(body.length > 250, 'body sample ' + body.length);
assert.ok(inside / total > 0.8, 'body in the hit ellipsoid ' + inside / total);
assert.ok(tolerant / total > 0.97, 'body in the tolerant ellipsoid ' + tolerant / total);

// 6. Proxy, fallback rig and batch.
const scene = new T.Scene();
const batch = new WalkerBatch(T, scene, { shadows: false });
const rat = batch.create('rat', 0.5);
rat.scale.setScalar(insectScale('rat', INSECT_SCALE, 4));
rat.userData.hasPosition = true;
const stride = walkerStride('rat', rat.scale.x);
const start = rat.userData.walkPhase;
batch.step(rat, 0, -0.25 * stride, 0.5);
assert.ok(
  Math.abs(((((rat.userData.walkPhase - start) % 1) + 1) % 1) - 0.25) < 1e-6,
  'phase follows distance',
);
assert.deepEqual(rat.userData.hitEllipsoid, RAT_HIT.radii);
const fallback = createGraphics(T, scene).insect('rat');
assert.ok(fallback.userData.walk, 'rigged fallback walks');
assert.deepEqual(fallback.userData.hitEllipsoid, RAT_HIT.radii);
for (const model of [rat, fallback]) {
  model.position.set(0, 0, -10);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const insects = new Map([[3, model]]);
  const ahead = new T.Vector3(0, 0, -1);
  assert.equal(nearestInsectHit(T, new T.Vector3(0, 0.5, 0), ahead, insects)?.id, 3, 'body hit');
  assert.ok(!nearestInsectHit(T, new T.Vector3(1.5, 0.5, 0), ahead, insects), 'beside misses');
}
batch.flush(new Map([[1, rat]]));
assert.equal(batch.batches.rat.mesh.count, 1, 'one rat drawn');

console.log(
  JSON.stringify({
    triangles: RAT_DATA.source.triangles,
    bones: RAT_DATA.bones.length,
    frames: bake.frames,
    stride: +median.toFixed(3),
    textureBytes: RAT_DATA.source.textureBytes,
  }),
);
console.log(
  'PASS: Meshy rat provenance, walking clip replayed bone for bone, paws on the ground, matching stride, ellipsoid hits, proxy and VAT bake.',
);
