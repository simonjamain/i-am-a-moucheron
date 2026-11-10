// Meshy ant and egg-laying spider: provenance, rig orientation, planted-foot
// walk cycles (tripod / alternating tetrapod), distance-driven gait proxies,
// ellipsoid hits and the shared VAT bake (src/walker-gait.js, src/walker-batch.js).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { ANT_DATA } from '../src/ant-data.js';
import { SPIDER_DATA } from '../src/spider-data.js';
import { WALKERS, WalkerBatch, walkerStride } from '../src/walker-batch.js';
import { footCycle, nearestRest, REST_PHASES, SWING } from '../src/walker-gait.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit, insectContact, InsectIndex } from '../src/insect-hits.js';
import { GROUND_FOOT_DEPTH, GROUND_FOOT_CLEARANCE, INSECT_SCALE } from '../src/scale.js';
import { insectScale } from '../src/insect-status.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, label + ': ' + a + ' vs ' + b);

// 1. Provenance and bone maps.
assert.equal(
  ANT_DATA.source.sha256,
  '12064094b4fe8ea01f88eabab6760b1ac71d635dc80425d3a92cdc81edb2b4cd',
);
assert.equal(
  SPIDER_DATA.source.sha256,
  'e8d8f32d7739467f6758b4220dc373bfcbacae42a004fdc4d29bbfc36d1c3faa',
);
assert.equal(ANT_DATA.bones.length, 52);
assert.equal(SPIDER_DATA.bones.length, 30);
assert.equal(WALKERS.ant.bones.legs.length, 6);
assert.equal(WALKERS.spider.bones.legs.length, 8);
for (const walker of Object.values(WALKERS)) {
  const names = new Set(walker.creature.data.bones.map((b) => b.name));
  for (const leg of walker.bones.legs)
    for (const key of ['hip', 'knee', 'tip']) assert.ok(names.has(leg[key]), leg[key]);
  // Half the legs swing first, the other half next; the two sides alternate.
  const groups = walker.bones.legs.map((leg) => leg.group);
  assert.equal(groups.filter((g) => g === 0).length, groups.length / 2);
  for (let i = 0; i < groups.length; i += 2)
    assert.notEqual(groups[i], groups[i + 1], 'left/right alternate');
}

// 2. Gait helpers: swing then stance, planted feet slide back at stride speed.
const stance = footCycle(SWING + 0.01, 0, 1, 0.2);
assert.ok(!stance.swing && stance.up === 0);
near(footCycle(SWING, 0, 1, 0.2).forward, 0.5, 1e-9, 'touch-down ahead');
near(footCycle(0.999, 0, 1, 0.2).forward, -0.5, 2e-3, 'lift-off behind');
assert.ok(footCycle(SWING / 2, 0, 1, 0.2).up > 0.19, 'foot lifts mid-swing');
for (const rest of REST_PHASES)
  for (const group of [0, 1])
    assert.ok(!footCycle(rest, group * 0.5, 1, 0.2).swing, 'rest: all planted');
near(nearestRest(0.5), 0.45, 1e-9, 'nearest rest');
near(nearestRest(0.02), -0.05, 1e-9, 'nearest rest wraps');

// 3. Rigs: head towards -Z, feet on the shared ground lift, no foot below it
// during the whole cycle, planted feet move backwards at the body speed.
for (const [type, walker] of Object.entries(WALKERS)) {
  const rig = walker.creature.createRig(T);
  const h = walker.creature.helpers(T);
  const world = (name) => rig.bones[name].getWorldPosition(new T.Vector3());
  const head = type === 'ant' ? 'Bone_002' : 'Bone_001';
  const tail = type === 'ant' ? 'Bone_005' : 'Bone_022';
  assert.ok(world(head).z < world(tail).z - 0.5, type + ': head forward (-Z)');
  const box = new T.Box3().setFromObject(rig.container);
  near(box.min.y, -GROUND_FOOT_DEPTH + GROUND_FOOT_CLEARANCE, 0.02, type + ': feet on the lift');
  const size = box.getSize(new T.Vector3());
  assert.ok(size.z > 1.8 && size.z < 2.4, type + ' length ' + size.z);
  // Foot contact points through the cycle (presentation space).
  const tips = walker.bones.legs.map((leg) => h.lowest(leg.tip));
  const skinned = (leg, k) => {
    const bone = rig.bones[leg.knee];
    // The tip point is rigid below the knee: carry it with the knee bone.
    const inverseBind = new T.Matrix4().copy(
      rig.skeleton.boneInverses[walker.creature.boneIndex(leg.knee)],
    );
    return tips[k].clone().applyMatrix4(inverseBind).applyMatrix4(bone.matrixWorld);
  };
  const steps = 40;
  const feet = [];
  for (let i = 0; i < steps; i++) {
    rig.pose(i / steps);
    rig.container.updateMatrixWorld(true);
    feet.push(walker.bones.legs.map(skinned));
  }
  const floor = -GROUND_FOOT_DEPTH + GROUND_FOOT_CLEARANCE;
  for (const frame of feet)
    for (const f of frame) assert.ok(f.y > floor - 0.01, type + ': no foot under the floor ' + f.y);
  let lifted = 0;
  for (const frame of feet) for (const f of frame) if (f.y > floor + 0.03) lifted++;
  assert.ok(lifted > steps * walker.bones.legs.length * 0.2, type + ': feet lift during the swing');
  // Planted feet: between two frames, the foot moves along +Z (body forward is
  // -Z after presentation) by stride / (1 - SWING) per cycle, with little drift.
  const stride = walker.model.stride * walker.model.scale;
  const expected = stride / (1 - SWING) / steps;
  let planted = 0,
    drift = 0,
    sideways = 0;
  for (let i = 0; i < steps; i++) {
    const a = feet[i],
      b = feet[(i + 1) % steps];
    walker.bones.legs.forEach((leg, k) => {
      const phase = (i + 0.5) / steps;
      if (footCycle(phase, leg.group * 0.5, 1, 1).swing) return;
      if (footCycle((i + 1) / steps, leg.group * 0.5, 1, 1).swing) return;
      planted++;
      drift += Math.abs(b[k].z - a[k].z - expected);
      sideways += Math.abs(b[k].x - a[k].x);
    });
  }
  assert.ok(planted > steps * 2, type + ': planted samples');
  assert.ok(
    drift / planted < expected * 0.15,
    type + ': planted feet do not slide: ' + drift / planted + ' vs ' + expected,
  );
  assert.ok(sideways / planted < expected * 0.15, type + ': planted feet do not wander sideways');
  // Loop closes.
  const first = walker.creature.pose(T, 0),
    last = walker.creature.pose(T, 1);
  for (const [name, p] of Object.entries(first))
    assert.ok(p.rotation.angleTo(last[name].rotation) < 1e-6, name);
  // Bake: frames x vertices, unit normals, feet never under the floor.
  const bake = walker.creature.bake(T, 12);
  assert.equal(bake.positions.length, 12 * bake.count * 3);
  let minY = Infinity;
  for (let i = 1; i < bake.positions.length; i += 3) minY = Math.min(minY, bake.positions[i]);
  // Planted tarsi tilt a little with the leg: they may dip below the clearance
  // but never through the real floor (the shared ground lift).
  assert.ok(minY > -GROUND_FOOT_DEPTH + 0.005, type + ': baked vertices above the floor ' + minY);
  for (let i = 0; i < bake.normals.length; i += 3)
    assert.ok(
      Math.abs(Math.hypot(bake.normals[i], bake.normals[i + 1], bake.normals[i + 2]) - 1) < 1e-3,
    );
}

// 4. Proxies: heading on the floor plane, gait phase from distance, settle at rest.
const scene = new T.Scene();
const batch = new WalkerBatch(T, scene, { shadows: false });
const ant = batch.create('ant', 1.2);
ant.scale.setScalar(insectScale('ant', INSECT_SCALE, 0.8));
const stride = walkerStride('ant', ant.scale.x);
assert.ok(stride > 0.001 && stride < 0.02, 'ant stride in world metres: ' + stride);
ant.position.set(0, 0, 0);
ant.userData.hasPosition = true;
const start = ant.userData.walkPhase;
batch.step(ant, 0.3 * stride, 0.4 * stride, 0.1); // half a stride, towards +x +z
near((((ant.userData.walkPhase - start) % 1) + 1) % 1, 0.5, 1e-6, 'phase follows distance');
for (let i = 0; i < 30; i++) batch.step(ant, 0.3 * stride, 0.4 * stride, 0.016);
const forward = new T.Vector3(0, 0, -1).applyQuaternion(ant.quaternion);
near(forward.x, 0.6, 1e-3, 'faces the movement');
near(forward.y, 0, 1e-9, 'stays on the floor plane');
ant.userData.walkPhase = 0.2;
batch.step(ant, 5 * stride, 0, 0.1); // 50 cycles/s requested: capped to 8 cycles/s
near(ant.userData.walkPhase, (0.2 + 0.8) % 1, 1e-9, 'gait rate is capped');
ant.userData.walkPhase = 0.6;
for (let i = 0; i < 60; i++) batch.step(ant, 0, 0, 0.05);
near(ant.userData.walkPhase, 0.45, 1e-3, 'settles into a planted pose');
const insects = new Map([[0, ant]]);
const spider = batch.create('spider', 0);
spider.position.set(0.2, 0, 0);
spider.scale.setScalar(insectScale('spider', INSECT_SCALE, 2.3));
insects.set(1, spider);
batch.flush(insects);
assert.equal(batch.batches.ant.mesh.count, 1);
assert.equal(batch.batches.spider.mesh.count, 1);
assert.equal(scene.children.length, 2, 'one instanced mesh per species');

// 5. Hits: the ellipsoid follows the heading; legs are not part of it; contact
// and indexed hits agree with the exhaustive path and with the rigged model.
ant.quaternion.identity();
ant.updateMatrixWorld();
const origin = new T.Vector3(0, 0.18 * ant.scale.x, 1);
const dir = new T.Vector3(0, 0, -1);
assert.equal(nearestInsectHit(T, origin, dir, insects, 3)?.id, 0, 'head-on hit');
const side = new T.Vector3(0.39 * ant.scale.x, 0.18 * ant.scale.x, 1);
assert.equal(nearestInsectHit(T, side, dir, insects, 3)?.id, 0, 'inside the body width');
const wide = new T.Vector3(0.7 * ant.scale.x, 0.18 * ant.scale.x, 1);
assert.notEqual(nearestInsectHit(T, wide, dir, insects, 3)?.id, 0, 'legs are not hit volume');
ant.rotation.y = Math.PI / 2; // body now along x
assert.equal(
  nearestInsectHit(T, new T.Vector3(0.9 * ant.scale.x, 0.18 * ant.scale.x, 1), dir, insects, 3)?.id,
  0,
  'rotated body',
);
assert.ok(insectContact(T, new T.Vector3(0, 0.18 * ant.scale.x, 0), ant, 0), 'contact at centre');
assert.ok(!insectContact(T, new T.Vector3(0, 2 * ant.scale.x, 0), ant, 0), 'no contact above');
const index = new InsectIndex(T, insects);
for (const o of [origin, side, wide])
  assert.equal(
    nearestInsectHit(T, o, dir, insects, 3, null, index)?.id,
    nearestInsectHit(T, o, dir, insects, 3)?.id,
  );
const graphics = createGraphics(T, new T.Scene());
const rigged = graphics.insect('ant');
rigged.scale.copy(ant.scale);
rigged.rotation.y = Math.PI / 2;
assert.deepEqual(rigged.userData.hitEllipsoid, ant.userData.hitEllipsoid);
assert.equal(
  nearestInsectHit(
    T,
    new T.Vector3(0.9 * ant.scale.x, 0.18 * ant.scale.x, 1),
    dir,
    new Map([[0, rigged]]),
    3,
  )?.id,
  0,
);
rigged.userData.animate(0.5, { speed: stride });
assert.ok(
  Math.abs(rigged.userData.walk.phase - 0.95) < 1e-6 ||
    Math.abs(rigged.userData.walk.phase - 0.45 - 0.5) < 1e-6,
  'soul walks',
);

console.log(
  JSON.stringify({
    ant: {
      triangles: ANT_DATA.source.triangles,
      bones: ANT_DATA.bones.length,
      vatBytes: batch.batches.ant.vat.bytes,
    },
    spider: {
      triangles: SPIDER_DATA.source.triangles,
      bones: SPIDER_DATA.bones.length,
      vatBytes: batch.batches.spider.vat.bytes,
    },
  }),
);
console.log(
  'PASS: Meshy ant and spider rigs, planted-foot gaits, distance-driven proxies, ellipsoid hits and VAT bakes.',
);
