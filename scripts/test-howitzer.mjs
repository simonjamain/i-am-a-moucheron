// Issue #113: the anti-materiel gun is the user-supplied Meshy howitzer with a
// traverse (whole gun, wheels counter-rotating), an elevation (cradle on its
// trunnion, -5°..+40°) and a tube recoil on each shot.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { HOWITZER_DATA } from '../src/howitzer-data.js';
import { createHowitzer, HOWITZER, HOWITZER_SCALE } from '../src/howitzer-model.js';
import { makeFortificationStation } from '../src/fortification-model.js';
import { FORTIFICATIONS } from '../src/ground-fortifications.js';
import { MAP } from '../src/scale.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
const world = (o) => o.getWorldPosition(new T.Vector3());
const DEG = Math.PI / 180;

// 1. Provenance and reviewed split: every shell kept, none cut.
const { source } = HOWITZER_DATA;
assert.equal(source.sha256, '5d30ba36257eba9893dabba6548cc8e86ee0db8a816c8b509b386408e46b3c5c');
assert.deepEqual(Object.keys(HOWITZER_DATA.parts).sort(), [
  'carriage',
  'cradle',
  'tube',
  'wheelLeft',
  'wheelRight',
]);
assert.equal(
  Object.values(source.parts).reduce((a, b) => a + b, 0),
  source.triangles,
  'all triangles assigned',
);

// 2. Player scale, ground contact, shared resources.
const a = createHowitzer(T),
  b = createHowitzer(T);
const meshes = (h) => {
  const list = [];
  h.yaw.traverse((o) => o.isMesh && list.push(o));
  return list;
};
assert.equal(meshes(a).length, 5);
for (const [i, mesh] of meshes(a).entries()) {
  assert.equal(mesh.geometry, meshes(b)[i].geometry, 'shared geometry');
  assert.equal(mesh.material, meshes(b)[i].material, 'shared material');
  assert.equal(mesh.userData.meshyShared, true, 'never disposed per instance');
}
a.yaw.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(a.yaw);
near(box.min.y, 0, 1e-3, 'wheels and spades on the ground');
const size = box.getSize(new T.Vector3());
assert.ok(size.z > 5.5 && size.z < 7.5, 'about 6.4 m long: ' + size.z);
assert.ok(size.y > 1.6 && size.y < 2.4, 'about 2 m tall, like the 1.8 m player: ' + size.y);
near(2 * HOWITZER_DATA.pivots.wheelRadius * HOWITZER_SCALE, 1.1, 1e-9, 'wheel diameter');
const wheelBox = new T.Box3().setFromObject(a.wheels[0].group);
near(wheelBox.max.y - wheelBox.min.y, 1.1, 0.02, 'wheel diameter in the scene');
const axleMid = a.wheels[0].group.position
  .clone()
  .add(a.wheels[1].group.position)
  .multiplyScalar(0.5);
near(axleMid.x, 0, 0.02, 'gun pivots around the middle of the axle (x)');
near(axleMid.z, 0, 1e-9, 'gun pivots around the middle of the axle (z)');

// 3. The muzzle stays on the bore axis and the barrel points where it aims.
function boreError(h) {
  h.yaw.updateMatrixWorld(true);
  const bore = world(h.muzzle).sub(world(h.pitch)).normalize();
  return bore.angleTo(h.direction());
}
const c = createHowitzer(T);
for (const [yaw, pitch] of [
  [0, 0],
  [1.2, 20 * DEG],
  [-2.5, 40 * DEG],
  [3, -5 * DEG],
]) {
  c.pose(yaw, pitch);
  assert.ok(boreError(c) < 0.6 * DEG, 'muzzle on the bore axis at ' + [yaw, pitch]);
}

// 4. Elevation limits and slewing rates; the returned direction is the real one.
const d = createHowitzer(T);
const dir = (yaw, pitch) =>
  new T.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
for (let i = 0; i < 100; i++) d.aim(0.05, dir(0, 80 * DEG));
near(d.state.pitch, HOWITZER.maxPitch, 1e-9, 'max elevation +40°');
for (let i = 0; i < 100; i++) d.aim(0.05, dir(0, -30 * DEG));
near(d.state.pitch, HOWITZER.minPitch, 1e-9, 'min elevation -5°');
d.pose(0, 0);
const real = d.aim(1, dir(Math.PI / 2, 30 * DEG));
near(d.state.yaw, 45 * DEG, 1e-9, 'traverse 45°/s');
near(d.state.pitch, 30 * DEG, 1e-9, 'elevation reached within the rate');
assert.ok(real.angleTo(dir(45 * DEG, 30 * DEG)) < 1e-9, 'fires along the barrel, not the target');
d.aim(1, dir(Math.PI / 2, 30 * DEG));
near(d.state.yaw, Math.PI / 2, 1e-9, 'reaches the target');
d.pose(170 * DEG, 0);
d.aim(0.1, dir(-170 * DEG, 0));
near(d.state.yaw, 174.5 * DEG, 1e-9, 'takes the short way across ±180°');
const turned = createHowitzer(T);
turned.yaw.rotation.y = 0; // parent rotation (station angle) is respected
const parent = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.7);
turned.aim(10, dir(0.7, 0), parent);
near(turned.state.yaw, 0, 1e-9, 'aim is expressed relative to the station angle');

// 5. Wheels counter-rotate and roll without slipping while the gun pivots.
const e = createHowitzer(T);
const [w0, w1] = e.wheels;
e.pose(0.5, 0);
near(w0.group.rotation.x, -w1.group.rotation.x, 1e-9, 'opposite wheel rotations');
const halfTrack = Math.abs(w0.group.position.x);
near(Math.abs(w0.group.rotation.x) * 0.55, 0.5 * halfTrack, 1e-9, 'arc rolled = arc travelled');
// The +X wheel moves forward (-Z) when the gun turns left: it rolls forward.
const plusX = w0.side > 0 ? w0 : w1;
assert.ok(plusX.group.rotation.x < 0, 'forward roll of the outer wheel');

// 6. Recoil: tube back along the bore, return to battery, carriage jolt.
const f = createHowitzer(T);
f.pose(0.3, 20 * DEG);
f.tick(0);
f.yaw.updateMatrixWorld(true);
const battery = world(f.muzzle);
f.fire();
const back = f.tick(HOWITZER.recoilBack);
near(back, 1, 1e-9, 'full recoil');
near(f.slide.position.z, 0.3 * HOWITZER_DATA.pivots.tubeLength * HOWITZER_SCALE, 1e-9, 'stroke');
assert.ok(f.body.position.z > 0, 'carriage jolt backwards');
f.yaw.updateMatrixWorld(true);
const moved = world(f.muzzle).sub(battery);
assert.ok(moved.normalize().dot(f.direction()) < -0.99, 'tube recoils along the bore');
f.tick(HOWITZER.recoilReturn);
near(f.slide.position.z, 0, 1e-9, 'back in battery');
near(f.body.position.z, 0, 1e-9, 'jolt settled');

// 7. Fortification station: articulated gun, real muzzle, footprint covers the sweep.
const station = makeFortificationStation(
  T,
  { kind: 'antitank', x: 0, y: 0, z: 0, angle: 0 },
  { box() {}, cyl() {} },
);
assert.ok(station.userData.howitzer, 'antitank uses the howitzer');
assert.equal(station.userData.muzzles[0], station.userData.howitzer.muzzle);
assert.equal(station.userData.pitch, station.userData.howitzer.pitch);
// Largest horizontal distance of any vertex from the pivot, over the elevation range.
let sweep = 0;
const g = createHowitzer(T),
  v = new T.Vector3();
for (const pitch of [HOWITZER.minPitch, HOWITZER.maxPitch]) {
  g.pose(0, pitch);
  g.yaw.updateMatrixWorld(true);
  for (const mesh of meshes(g)) {
    const position = mesh.geometry.attributes.position;
    for (let k = 0; k < position.count; k++) {
      v.fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld);
      sweep = Math.max(sweep, Math.hypot(v.x, v.z));
    }
  }
}
assert.ok(sweep > 3 && sweep < 3.6, 'muzzle reach ~3.4 m: ' + sweep);
assert.ok(MAP.metres(sweep) <= FORTIFICATIONS.antitank.footprint, 'footprint covers the sweep');
console.log(
  'Howitzer: Meshy split (5 parts), 1.1 m wheels at player scale, -5°..+40° elevation, 45°/s traverse with counter-rotating wheels, tube recoil and jolt, shared resources.',
);
