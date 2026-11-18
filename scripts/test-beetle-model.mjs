// Meshy armoured beetle (`brute`): provenance, added wing bones, rigid closed
// elytra, procedural flight cycle, VAT bake, batched proxies and ellipsoid hits
// (src/beetle-model.js, src/flyer-batch.js, scripts/import-beetle.py).
import { FLYER_HIT_TOLERANCE } from '../src/scale.ts';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { BEETLE_DATA } from '../src/beetle-data.js';
import {
  BEETLE,
  BEETLE_BONES,
  BEETLE_FLIGHT,
  BEETLE_HIT,
  beetleFlightPose,
} from '../src/beetle-model.js';
import { FLYERS, FlyerBatch } from '../src/flyer-batch.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit } from '../src/insect-hits.js';
import { ENEMY_TYPES } from '../src/waves.js';

const world = (o) => o.getWorldPosition(new T.Vector3());
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// 1. Data: approved source, 48 Meshy bones + 2 wing bones, each wing rigid.
assert.equal(
  BEETLE_DATA.source.sha256,
  'a7d151caade694bb3cd260f51282ff7e451be91014b99099eee6ba7e77ecaa1f',
);
assert.equal(BEETLE_DATA.bones.length, 50);
assert.deepEqual(
  BEETLE_DATA.source.addedWingBones.map((w) => w.bone),
  BEETLE_BONES.wings,
);
for (const name of [BEETLE_BONES.root, ...BEETLE_BONES.wings, ...BEETLE_BONES.legs.flat()])
  assert.ok(
    BEETLE_DATA.bones.some((b) => b.name === name),
    name,
  );
assert.ok(BEETLE_DATA.source.bodyLegWeightsMoved > 100, 'carapace freed from the leg bones');
const joints = bytes(BEETLE_DATA.joints);
const weights = bytes(BEETLE_DATA.weights);
const positions = new Float32Array(bytes(BEETLE_DATA.positions).buffer);
const count = joints.length / 4;
for (let v = 0; v < count; v++)
  assert.equal(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3], 255);
for (const [k, wing] of BEETLE_DATA.source.addedWingBones.entries()) {
  let n = 0;
  for (let v = 0; v < count; v++)
    if (joints[v * 4] === 48 + k) {
      n++;
      assert.equal(weights[v * 4], 255, 'wing vertices follow only their bone');
    }
  assert.equal(n, wing.vertices);
  assert.ok(Math.sign(wing.hinge[0]) === (k ? -1 : 1), 'Wing_L on +X (beetle faces +Z)');
}

// 2. Rig: presentation head towards -Z (client heading), centred, readable size.
const rig = BEETLE.createRig(T);
rig.pose(BEETLE.rest);
rig.container.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(rig.container);
const size = box.getSize(new T.Vector3());
assert.ok(size.z > 1.8 && size.z < 2.6, 'body length ' + size.z);
assert.ok(size.x > 2.2 && size.x < 3.4, 'wingspan ' + size.x);
assert.ok(box.getCenter(new T.Vector3()).length() < 0.5, 'body near the origin');
assert.ok(
  world(rig.bones.Bone_012).z < world(rig.bones[BEETLE_BONES.root]).z - 0.5,
  'head forward (-Z), abdomen behind',
);

// 3. Flight cycle: periodic loop, symmetric wing beat with the right amplitude,
// legs hanging below the body.
const tipVertex = BEETLE_DATA.source.addedWingBones.map((wing, k) => {
  const hinge = new T.Vector3().fromArray(wing.hinge);
  let best = hinge;
  for (let v = 0; v < count; v++) {
    const p = new T.Vector3().fromArray(positions, v * 3);
    if (joints[v * 4] === 48 + k && p.distanceTo(hinge) > best.distanceTo(hinge)) best = p;
  }
  return best.sub(hinge);
});
const span = (side, t) => {
  rig.pose(t);
  const bone = rig.bones[BEETLE_BONES.wings[side]];
  return tipVertex[side].clone().applyMatrix4(bone.matrixWorld).sub(world(bone)).normalize();
};
const top = span(0, 0),
  bottom = span(0, 0.5 / BEETLE_FLIGHT.beats);
assert.ok(top.y > 0.6, 'wing raised at the top of the stroke: ' + top.y);
assert.ok(bottom.y < -0.1, 'wing lowered at the bottom of the stroke: ' + bottom.y);
for (const t of [0, 0.03, 0.31]) {
  const left = span(0, t),
    right = span(1, t);
  assert.ok(Math.abs(left.y - right.y) < 0.15 && Math.abs(left.z - right.z) < 0.15, 'symmetric');
  assert.ok(left.x * right.x < 0, 'one wing per side');
}
const q0 = beetleFlightPose(T, 0),
  q1 = beetleFlightPose(T, 1);
for (const [name, p] of Object.entries(q0))
  assert.ok(p.rotation.angleTo(q1[name].rotation) < 1e-6, 'loop closes: ' + name);
assert.equal(BEETLE_FLIGHT.frames, BEETLE_FLIGHT.beats * BEETLE_FLIGHT.framesPerBeat);
rig.pose(0.2);
rig.container.updateMatrixWorld(true);
for (const [hip, knee] of BEETLE_BONES.legs)
  assert.ok(world(rig.bones[knee]).y < world(rig.bones[hip]).y, 'legs hang down: ' + hip);

// 4. Bake: wings sweep, closed elytra and head stay rigid with the body, the
// last frame leads smoothly back into the first.
const bake = BEETLE.bake(T);
assert.equal(bake.positions.length, bake.frames * bake.count * 3);
const point = (f, v) => new T.Vector3().fromArray(bake.positions, (f * bake.count + v) * 3);
const move = (a, b, filter) => {
  let max = 0;
  for (let v = 0; v < bake.count; v++)
    if (filter(v)) max = Math.max(max, point(a, v).distanceTo(point(b, v)));
  return max;
};
const isWing = (v) => joints[v * 4] >= 48;
const half = BEETLE_FLIGHT.framesPerBeat / 2;
assert.ok(move(0, half, isWing) > 0.6, 'wing tips sweep through the stroke');
// Carapace: elytra top and head (bind y > 1.2 or z > 1.1 above the legs).
const shell = [];
for (let v = 0; v < count; v++) {
  const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
  if (!isWing(v) && (y > 1.2 || (z > 1.1 && y > 0.55 && Math.abs(x) < 0.4))) shell.push(v);
}
assert.ok(shell.length > 80, 'carapace sample ' + shell.length);
const first = shell[0],
  far = shell.reduce((a, v) =>
    point(0, v).distanceTo(point(0, first)) > point(0, a).distanceTo(point(0, first)) ? v : a,
  );
for (let f = 0; f < bake.frames; f += 7)
  for (const v of shell)
    assert.ok(
      Math.abs(point(f, v).distanceTo(point(f, first)) - point(0, v).distanceTo(point(0, first))) <
        0.01 &&
        Math.abs(point(f, v).distanceTo(point(f, far)) - point(0, v).distanceTo(point(0, far))) <
          0.01,
      'rigid carapace (closed elytra), frame ' + f,
    );
const step = move(0, 1, isWing);
assert.ok(move(bake.frames - 1, 0, isWing) < step * 1.5, 'seamless loop');

// 5. Hit volume: the carapace (body shell above the legs, without wings) sits
// in the hit sphere, which the game's hit tolerance enlarges.
const [cx, cy, cz] = BEETLE_HIT.centre,
  [rx, ry, rz] = BEETLE_HIT.radii;
const body = [];
for (let v = 0; v < count; v++)
  if (!isWing(v) && positions[v * 3 + 1] > 0.45 && Math.abs(positions[v * 3]) < 0.95) body.push(v);
const level = (v) => {
  const p = point(0, v);
  return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 + ((p.z - cz) / rz) ** 2;
};
const within = (limit) => body.filter((v) => level(v) <= limit).length / body.length;
// The hit volume is a sphere (equal radii): played at the flyers' tolerance it
// covers the elongated carapace (a perfect sphere, so nose and tail stay out).
const played = FLYER_HIT_TOLERANCE ** 2;
assert.ok(within(played) > 0.9, 'carapace inside the played hit sphere ' + within(played));
assert.ok(within(1.5 ** 2) > 0.97, 'carapace inside the wide hit sphere ' + within(1.5 ** 2));
assert.ok(rx < size.x / 2 - 0.4, 'wings stay outside the hit volume');

// 6. Batched proxies and rigged fallback share the hit volume; only the brute
// uses the beetle, under its new name.
assert.deepEqual(Object.keys(FLYERS), ['brute', 'guard', 'mosquito']);
assert.equal(ENEMY_TYPES.brute.name, 'Scarabée');
const scene = new T.Scene();
const batch = new FlyerBatch(T, scene, { enabled: false });
assert.equal(batch.handles('brute'), false, 'disabled batch hands over to the rig');
const proxy = new FlyerBatch(T, scene, { enabled: true, vats: {} });
assert.ok(proxy.handles('brute') && !proxy.handles('midge') && !proxy.handles('ant'));
const flyer = proxy.create('brute', 1.3);
assert.ok(flyer.userData.instancedFlyer && flyer.userData.loopPhase >= 0);
assert.equal(flyer.userData.hitEllipsoid, undefined, 'the beetle hit volume is a sphere');
assert.ok(Math.abs(flyer.userData.sphereRadius - BEETLE_HIT.radii[0] * 1.2) < 1e-12);
const graphics = createGraphics(T, scene);
const fallback = graphics.insect('brute');
assert.ok(fallback.userData.flight, 'rigged fallback beats its wings');
assert.equal(fallback.userData.sphereRadius, flyer.userData.sphereRadius);
fallback.userData.animate(0.1);
for (const model of [flyer, fallback]) {
  model.position.set(0, 0, -10);
  model.updateMatrixWorld(true);
  const insects = new Map([[7, model]]);
  const ahead = new T.Vector3(0, 0, -1);
  const hit = nearestInsectHit(T, new T.Vector3(), ahead, insects);
  assert.equal(hit?.id, 7, 'shot at the body hits');
  const miss = nearestInsectHit(T, new T.Vector3(1.5, 0, 0), ahead, insects);
  assert.ok(!miss, 'shot beside the carapace misses');
}
proxy.flush(new Map([[1, flyer]]), 500);
assert.equal(proxy.batches.brute.mesh.count, 1, 'one instance drawn');

console.log(
  JSON.stringify({
    triangles: BEETLE_DATA.source.triangles,
    bones: BEETLE_DATA.bones.length,
    frames: bake.frames,
    vatHalfFloatBytes: 2 * bake.frames * bake.count * 4 * 2,
    textureBytes: BEETLE_DATA.source.textureBytes,
  }),
);
console.log(
  'PASS: Meshy beetle provenance, rigid wings and carapace, periodic symmetric wing beat, VAT bake, batched proxies and a spherical hit volume.',
);
