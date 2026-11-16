// Meshy bee (`guard`): provenance, rigid wing pairs, body freed from the wing
// and leg bones, procedural flight cycle, VAT bake, batched proxies and
// ellipsoid hits (src/bee-model.js, src/flyer-batch.js, scripts/import-bee.py).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { BEE_DATA } from '../src/bee-data.js';
import { BEE, BEE_BONES, BEE_FLIGHT, BEE_HIT, beeFlightPose } from '../src/bee-model.js';
import { FLYERS, FlyerBatch } from '../src/flyer-batch.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit } from '../src/insect-hits.js';
import { ENEMY_TYPES } from '../src/waves.js';

const world = (o) => o.getWorldPosition(new T.Vector3());
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// 1. Data: approved source, 45 Meshy bones, each wing pair rigid on its root.
assert.equal(
  BEE_DATA.source.sha256,
  'a126aa441a2f01b2034ea1b941d3b265c8228df74cf83be2ffe456f82622821d',
);
assert.equal(BEE_DATA.bones.length, 45);
assert.deepEqual(
  BEE_DATA.source.rigidWings.map((w) => w.bone),
  BEE_BONES.wings,
);
for (const name of [
  BEE_BONES.root,
  BEE_BONES.head,
  ...BEE_BONES.abdomen,
  ...BEE_BONES.antennae.flat(),
  ...BEE_BONES.legs.flat(),
])
  assert.ok(
    BEE_DATA.bones.some((b) => b.name === name),
    name,
  );
assert.ok(BEE_DATA.source.bodyWeightsMoved > 300, 'body freed from the wing and leg bones');
assert.ok(BEE_DATA.source.legWeightsMoved > 50, 'legs keep their own chain');
const joints = bytes(BEE_DATA.joints);
const weights = bytes(BEE_DATA.weights);
const positions = new Float32Array(bytes(BEE_DATA.positions).buffer);
const count = joints.length / 4;
for (let v = 0; v < count; v++)
  assert.equal(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3], 255);
const wingIndex = BEE_BONES.wings.map((name) => BEE.boneIndex(name));
const isWing = (v) => wingIndex.includes(joints[v * 4]);
for (const [k, wing] of BEE_DATA.source.rigidWings.entries()) {
  let n = 0,
    x = 0;
  for (let v = 0; v < count; v++)
    if (joints[v * 4] === wingIndex[k]) {
      n++;
      x += positions[v * 3];
      assert.equal(weights[v * 4], 255, 'wing vertices follow only their bone');
    }
  assert.equal(n, wing.vertices);
  assert.ok(Math.sign(x) === (k ? -1 : 1), 'first wing on +X (bee faces +Z)');
}
// No other vertex leans on a wing bone (the body never flaps with the wings).
const tips = new Set(['Bone_025', 'Bone_027'].map((name) => BEE.boneIndex(name)));
for (let v = 0; v < count; v++)
  for (let k = 0; k < 4; k++)
    if (weights[v * 4 + k] > 0) {
      assert.ok(!tips.has(joints[v * 4 + k]), 'wing tips carry no weight');
      if (!isWing(v)) assert.ok(!wingIndex.includes(joints[v * 4 + k]), 'body off the wings');
    }

// 2. Rig: presentation head towards -Z (client heading), centred, readable size.
const rig = BEE.createRig(T);
rig.pose(BEE.rest);
rig.container.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(rig.container);
const size = box.getSize(new T.Vector3());
assert.ok(size.z > 1.3 && size.z < 2, 'body length ' + size.z);
assert.ok(size.x > 1.4 && size.x < 2.6, 'wingspan ' + size.x);
assert.ok(box.getCenter(new T.Vector3()).length() < 0.5, 'body near the origin');
assert.ok(
  world(rig.bones[BEE_BONES.head]).z < world(rig.bones[BEE_BONES.abdomen[2]]).z - 0.6,
  'head forward (-Z), sting behind',
);

// 3. Flight cycle: periodic loop, symmetric wing beat, legs hanging.
// Farthest wing vertex from the hinge, skinned like the GPU does.
const tipVertex = BEE_BONES.wings.map((name, k) => {
  const hinge = BEE.helpers(T).bind(name);
  let best = hinge;
  for (let v = 0; v < count; v++) {
    const p = new T.Vector3().fromArray(positions, v * 3);
    if (joints[v * 4] === wingIndex[k] && p.distanceTo(hinge) > best.distanceTo(hinge)) best = p;
  }
  return best;
});
const span = (side, t) => {
  rig.pose(t);
  rig.container.updateMatrixWorld(true);
  const bone = rig.bones[BEE_BONES.wings[side]];
  const inverse = rig.mesh.skeleton.boneInverses[wingIndex[side]];
  return tipVertex[side]
    .clone()
    .applyMatrix4(inverse)
    .applyMatrix4(bone.matrixWorld)
    .sub(world(bone))
    .normalize();
};
const top = span(0, 0),
  bottom = span(0, 0.5 / BEE_FLIGHT.beats);
assert.ok(top.y > 0.6, 'wing raised at the top of the stroke: ' + top.y);
assert.ok(bottom.y < -0.15, 'wing lowered at the bottom of the stroke: ' + bottom.y);
for (const t of [0, 0.03, 0.31]) {
  const left = span(0, t),
    right = span(1, t);
  assert.ok(Math.abs(left.y - right.y) < 0.15 && Math.abs(left.z - right.z) < 0.15, 'symmetric');
  assert.ok(left.x * right.x < 0, 'one wing per side');
}
const q0 = beeFlightPose(T, 0),
  q1 = beeFlightPose(T, 1);
for (const [name, p] of Object.entries(q0))
  assert.ok(p.rotation.angleTo(q1[name].rotation) < 1e-6, 'loop closes: ' + name);
assert.equal(BEE_FLIGHT.frames, BEE_FLIGHT.beats * BEE_FLIGHT.framesPerBeat);
rig.pose(0.2);
rig.container.updateMatrixWorld(true);
for (const [hip, knee] of BEE_BONES.legs)
  assert.ok(world(rig.bones[knee]).y < world(rig.bones[hip]).y, 'legs hang down: ' + hip);

// 4. Bake: wings sweep, the loop is seamless (the body never leans on a wing
// bone, see 1).
const bake = BEE.bake(T);
assert.equal(bake.positions.length, bake.frames * bake.count * 3);
const point = (f, v) => new T.Vector3().fromArray(bake.positions, (f * bake.count + v) * 3);
const move = (a, b, filter) => {
  let max = 0;
  for (let v = 0; v < bake.count; v++)
    if (filter(v)) max = Math.max(max, point(a, v).distanceTo(point(b, v)));
  return max;
};
assert.ok(move(0, BEE_FLIGHT.framesPerBeat / 2, isWing) > 0.5, 'wing tips sweep');
assert.ok(move(bake.frames - 1, 0, isWing) < move(0, 1, isWing) * 1.5, 'seamless loop');

// 5. Hit volume: head, thorax and abdomen sit in the ellipsoid; the game's hit
// tolerance covers the sting and the corners; the wings stay outside.
const core = new Set(
  ['Bone_000', 'Bone_001', 'Bone_003', 'Bone_002', 'Bone_024', BEE_BONES.head]
    .concat(BEE_BONES.abdomen)
    .map((name) => BEE.boneIndex(name)),
);
const body = [];
for (let v = 0; v < count; v++) if (core.has(joints[v * 4])) body.push(v);
const [cx, cy, cz] = BEE_HIT.centre,
  [rx, ry, rz] = BEE_HIT.radii;
const level = (v) => {
  const p = point(0, v);
  return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 + ((p.z - cz) / rz) ** 2;
};
const within = (limit) => body.filter((v) => level(v) <= limit).length / body.length;
assert.ok(body.length > 200, 'body sample ' + body.length);
assert.ok(within(1) > 0.8, 'body inside the hit ellipsoid ' + within(1));
assert.ok(within(1.25 ** 2) > 0.97, 'body inside the tolerant ellipsoid ' + within(1.25 ** 2));
assert.ok(rx < size.x / 2 - 0.3, 'wings stay outside the hit volume');

// 6. Batched proxies and rigged fallback share the hit volume, under the new name.
assert.equal(ENEMY_TYPES.guard.name, 'Abeille');
assert.equal(FLYERS.guard.creature, BEE);
const scene = new T.Scene();
const proxy = new FlyerBatch(T, scene, { enabled: true, vats: {} });
assert.ok(proxy.handles('guard') && proxy.handles('brute') && !proxy.handles('midge'));
const flyer = proxy.create('guard', 0.7);
assert.ok(flyer.userData.instancedFlyer && flyer.userData.loopPhase >= 0);
assert.deepEqual(flyer.userData.hitEllipsoid, BEE_HIT.radii);
const graphics = createGraphics(T, scene);
const fallback = graphics.insect('guard');
assert.ok(fallback.userData.flight, 'rigged fallback beats its wings');
assert.deepEqual(fallback.userData.hitEllipsoid, BEE_HIT.radii);
fallback.userData.animate(0.1);
for (const model of [flyer, fallback]) {
  model.position.set(0, 0, -10);
  model.updateMatrixWorld(true);
  const insects = new Map([[7, model]]);
  const ahead = new T.Vector3(0, 0, -1);
  assert.equal(nearestInsectHit(T, new T.Vector3(), ahead, insects)?.id, 7, 'body shot hits');
  assert.ok(!nearestInsectHit(T, new T.Vector3(1.1, 0, 0), ahead, insects), 'beside misses');
}
const brute = proxy.create('brute', 0.2);
proxy.flush(
  new Map([
    [1, flyer],
    [2, brute],
  ]),
  500,
);
assert.equal(proxy.batches.guard.mesh.count, 1, 'one bee drawn');
assert.equal(proxy.batches.brute.mesh.count, 1, 'one beetle drawn');

console.log(
  JSON.stringify({
    triangles: BEE_DATA.source.triangles,
    bones: BEE_DATA.bones.length,
    frames: bake.frames,
    vatHalfFloatBytes: 2 * bake.frames * bake.count * 4 * 2,
    textureBytes: BEE_DATA.source.textureBytes,
  }),
);
console.log(
  'PASS: Meshy bee provenance, rigid wing pairs, periodic symmetric wing beat, VAT bake, batched proxies and ellipsoid hits.',
);
