import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { wavePlan, waveBudget, swarmFrame, legacyCost } from '../src/waves.js';
import { MAP, ACTOR_UNIT } from '../src/scale.ts';
import { createGraphics } from '../src/graphics.js';
import { makeAntiaircraft, aimGun, gunnerView } from '../src/sortie.js';
import { makeTracer, updateTracer } from '../src/tracers.js';
for (const wave of [1, 2, 3, 5, 10, 30, 100, 1000]) {
  const plan = wavePlan('SWARM', wave, 1234);
  assert.equal(
    plan.roster.reduce((s, e) => s + legacyCost(e), 0) -
      (plan.roster.filter((e) => e.type === 'midge').length / 5) * 4,
    waveBudget(wave),
  );
  assert.ok(plan.roster.length <= 900);
  assert.deepEqual(plan, wavePlan('SWARM', wave, 1234));
  if (wave > 1) assert.ok(plan.budget >= waveBudget(wave - 1));
}
assert.ok(wavePlan('SWARM', 1, 1).roster.length >= 8);
assert.notDeepEqual(wavePlan('SWARM', 8, 1).roster, wavePlan('SWARM', 8, 2).roster);
const plan = wavePlan('SWARM', 10, 1),
  frame = swarmFrame(plan.roster, 100),
  next = swarmFrame(plan.roster, 100.01);
assert.deepEqual(frame, swarmFrame(plan.roster, 100));
for (let i = 0; i < frame.length; i++)
  if (frame[i] && next[i]) {
    assert.ok(frame[i].p.every(Number.isFinite));
    const a = new T.Vector3().fromArray(frame[i].p),
      b = new T.Vector3().fromArray(next[i].p);
    assert.ok(a.distanceTo(b) / 0.01 < MAP.metres(90), 'bounded traversal speed on later routes');
  }
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  bomber = graphics.makeBomber('#ccc');
bomber.scale.setScalar(ACTOR_UNIT);
bomber.quaternion.setFromEuler(new T.Euler(0.1, 0.7, 0.2));
for (const mount of bomber.userData.turrets) {
  assert.ok(mount.userData.muzzle && mount.userData.pitch);
  for (const dir of [
    new T.Vector3(0, 0, -1),
    new T.Vector3(1, 0.3, 0.5).normalize(),
    new T.Vector3(-0.3, 0.7, 1).normalize(),
    new T.Vector3(0.1, 0.99, 0.1).normalize(),
  ]) {
    aimGun(T, mount, dir, bomber.quaternion);
    const actual = new T.Vector3(0, 0, -1).transformDirection(mount.userData.pitch.matrixWorld);
    assert.ok(actual.dot(dir) > 0.999999);
    const view = gunnerView(
      T,
      mount,
      dir,
      new T.Vector3(0, 1, 0).applyQuaternion(bomber.quaternion),
    );
    assert.ok(view.eye.distanceTo(view.muzzle) > MAP.metres(2));
    const sideways = view.eye.clone().sub(view.muzzle).cross(dir).length();
    assert.ok(sideways > MAP.metres(0.5), 'offset view must reveal tracer path');
  }
}
for (const gun of makeAntiaircraft(T, scene, graphics)) {
  gun.userData.yaw.userData.pitch = gun.userData.pitch;
  for (const dir of [
    new T.Vector3(0, 0.7, -0.7).normalize(),
    new T.Vector3(1, 0.3, 0.1).normalize(),
  ]) {
    aimGun(T, gun.userData.yaw, dir);
    const actual = new T.Vector3(0, 0, -1).transformDirection(gun.userData.pitch.matrixWorld);
    assert.ok(actual.dot(dir) > 0.999999);
    const left = gun.userData.muzzles[0].getWorldPosition(new T.Vector3()),
      right = gun.userData.muzzles[1].getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(left.distanceTo(right) - MAP.metres(0.72)) < 1e-9);
  }
}
const tracer = makeTracer(T, scene, new T.Vector3(0, 1, -1), new T.Vector3(0, 0, -1), '#ffcc64');
assert.equal(tracer.children.length, 2);
assert.ok(tracer.userData.length >= MAP.metres(10));
assert.equal(tracer.userData.core.material.isMeshBasicMaterial, true);
assert.equal(tracer.userData.halo.material.depthWrite, false);
const camera = new T.PerspectiveCamera(60, 1, 0.00005, 40);
updateTracer(T, tracer, new T.Vector3(0, 0, -1), camera);
const pixel = (2 * tracer.position.distanceTo(camera.position) * Math.tan(Math.PI / 6)) / 900;
assert.ok(
  (tracer.userData.width * 1.1 * tracer.scale.x) / pixel >= 2 - 1e-9,
  'luminous core stays at least two screen pixels wide',
);
tracer.userData.dispose();
scene.remove(tracer);
console.log(
  'PASS: exact rising budgets, seeded varied rosters, bounded deterministic flock flow, visible tracer geometry, gun mount directions and offset views.',
);

for (const mount of bomber.userData.turrets) {
  const up = new T.Vector3(0, 1, 0).applyQuaternion(bomber.quaternion),
    dir = up
      .clone()
      .multiplyScalar(0.95)
      .add(new T.Vector3(0, 0, -0.2))
      .normalize();
  aimGun(T, mount, dir, bomber.quaternion);
  const view = gunnerView(T, mount, dir, up),
    origin = mount.getWorldPosition(new T.Vector3());
  assert.ok(
    view.eye.clone().sub(origin).dot(up) > MAP.metres(1.1),
    'looking upward must not lower the gunner camera into the aircraft',
  );
}
