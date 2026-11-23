// Chase camera: the distance between a moving vehicle and its camera must not depend on the
// length of the frame, or a long frame makes the vehicle hop back on screen.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { followMoving } from '../src/camera-follow.ts';

const speed = 60, // world units per second
  rate = 10;
const frames = (name) =>
  ({
    steady: Array(240).fill(1 / 60),
    alternating: Array.from({ length: 240 }, (_, i) => (i % 2 ? 1 / 30 : 1 / 120)),
    spikes: Array.from({ length: 240 }, (_, i) => (i % 40 === 39 ? 0.1 : 1 / 60)),
  })[name];
function run(name, follow) {
  const camera = new T.Vector3(),
    car = new T.Vector3(),
    lags = [];
  for (const dt of frames(name)) {
    car.z -= speed * dt;
    follow(camera, car, dt);
    lags.push(camera.z - car.z);
  }
  return lags.slice(150);
}
const spread = (a) => Math.max(...a) - Math.min(...a);
const old = (camera, car, dt) => camera.lerp(car, 1 - Math.exp(-rate * dt));
const fixed = (camera, car, dt) => followMoving(camera, car, new T.Vector3(0, 0, -speed), rate, dt);
for (const name of ['steady', 'alternating', 'spikes']) {
  const before = spread(run(name, old)),
    after = spread(run(name, fixed));
  console.log(name + ': lag spread ' + before.toExponential(2) + ' → ' + after.toExponential(2));
  assert.ok(after < 1e-6, name + ': the lag does not depend on the frame time');
  if (name !== 'steady') assert.ok(before > 0.01, name + ': the plain lerp hops by ' + before);
}
// The settled lag is v/rate behind, and the camera does not run ahead.
const lags = run('steady', fixed);
assert.ok(Math.abs(lags.at(-1) - speed / rate) < 1e-9, 'lag v/k');
// A still target is reached exactly like a lerp.
const c = new T.Vector3(10, 0, 0);
followMoving(c, new T.Vector3(0, 0, 0), new T.Vector3(), rate, 0.1);
assert.ok(Math.abs(c.x - 10 * Math.exp(-1)) < 1e-12);
console.log('camera follow ok');
