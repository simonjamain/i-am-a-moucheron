import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { mouseFlightControls, mouseCameraRotation, rotateMouseAim } from '../src/mouse-flight.js';
import { stepFlight } from '../src/flight.js';
import worker from '../worker/index.js';
const forward = (q) => new T.Vector3(0, 0, -1).applyQuaternion(q);
// Aiming is a persistent world direction, independent of aircraft rotation and frame rate.
const aim = new T.Vector3(0, 0, -1),
  camera = new T.Quaternion();
rotateMouseAim(T, aim, camera, 100, 0);
assert.ok(aim.x > 0.2);
assert.ok(Math.abs(aim.length() - 1) < 1e-10);
const before = aim.clone();
mouseCameraRotation(T, aim, camera, 0.1);
assert.ok(aim.distanceTo(before) < 1e-12);
rotateMouseAim(T, aim, camera, 0, 0);
assert.ok(aim.distanceTo(before) < 1e-12, 'a stationary mouse does not keep turning the target');
const up = new T.Vector3(0, 0, -1);
rotateMouseAim(T, up, new T.Quaternion(), 0, -80);
assert.ok(up.y > 0.15, 'mouse up aims up');
const rolledCamera = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2),
  screenRight = new T.Vector3(1, 0, 0).applyQuaternion(rolledCamera),
  rolledAim = new T.Vector3(0, 0, -1);
rotateMouseAim(T, rolledAim, rolledCamera, 100, 0);
assert.ok(rolledAim.dot(screenRight) > 0.2, 'mouse motion is screen-relative');
const neutral = mouseFlightControls(T, {
  q: new T.Quaternion(),
  omega: new T.Vector3(),
  direction: new T.Vector3(0, 0, -1),
});
assert.deepEqual(
  Object.values(neutral).map((x) => Math.abs(x)),
  [0, 0, 0],
);
const right = mouseFlightControls(T, {
  q: new T.Quaternion(),
  omega: new T.Vector3(),
  direction: new T.Vector3(1, 0, -1).normalize(),
});
assert.ok(right.roll < 0 && right.yaw > 0, 'bank and rudder turn right');
// Isolate steering convergence from energy loss by holding airspeed along the body axis.
for (const target of [
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, -1],
  [0, -1, -1],
  [1, 0.4, -1],
  [0, 0, 1],
]) {
  const q = new T.Quaternion(),
    vel = new T.Vector3(),
    omega = new T.Vector3(),
    direction = new T.Vector3(...target).normalize();
  for (let i = 0; i < 1200; i++) {
    vel.set(0, 0, -18).applyQuaternion(q);
    const controls = mouseFlightControls(T, { q, omega, direction });
    assert.ok(Object.values(controls).every((x) => Number.isFinite(x) && Math.abs(x) <= 1));
    const old = q.clone();
    stepFlight(
      T,
      { q, vel, omega, wind: new T.Vector3(), gas: 0.7, wing: 1, engine: 1, ...controls },
      1 / 120,
    );
    assert.ok(q.angleTo(old) < 0.04, 'instructor never teleports the aircraft orientation');
  }
  assert.ok(forward(q).dot(direction) > 0.995, 'aircraft converges toward the requested direction');
}
// Actual flight still loses energy, stalls and responds to wind; instructor output stays bounded.
const q = new T.Quaternion(),
  vel = new T.Vector3(0, 0, -18),
  omega = new T.Vector3(),
  direction = new T.Vector3(1, 0.2, -1).normalize();
for (let i = 0; i < 7200; i++) {
  const c = mouseFlightControls(T, { q, omega, direction });
  stepFlight(
    T,
    {
      q,
      vel,
      omega,
      wind: new T.Vector3(4, 0, 0),
      gas: 0.7,
      wing: i < 3600 ? 1 : 0,
      engine: 1,
      ...c,
    },
    1 / 120,
  );
  assert.ok([...q.toArray(), ...vel.toArray()].every(Number.isFinite));
}
let rig = new T.Quaternion();
for (const y of [1, -1])
  for (let i = 0; i < 120; i++) {
    mouseCameraRotation(T, new T.Vector3(0.0001, y, 0).normalize(), rig, 1 / 60);
    assert.ok(rig.toArray().every(Number.isFinite));
  }
const a = new T.Quaternion(),
  b = new T.Quaternion(),
  dir = new T.Vector3(1, 0, -1).normalize();
for (let i = 0; i < 60; i++) mouseCameraRotation(T, dir, a, 1 / 60);
for (let i = 0; i < 120; i++) mouseCameraRotation(T, dir, b, 1 / 120);
assert.ok(a.angleTo(b) < 1e-6, 'camera damping is frame-rate independent');
const response = await worker.fetch(new Request('https://test.local/mouse-flight.js'), {});
assert.equal(response.status, 200);
assert.match(await response.text(), /export function mouseFlightControls/);
console.log(
  'PASS: persistent world aim, screen-relative mouse input, physical steering convergence in six directions, bounded commands, no orientation teleport, wind/damage stability, vertical camera and frame-rate-independent damping.',
);
