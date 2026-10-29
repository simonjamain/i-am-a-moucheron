import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { stepFlight } from '../src/flight.js';
import { readPad, deadzone } from '../src/input.js';
import worker from '../worker/index.js';
const state = () => ({
  q: new T.Quaternion(),
  vel: new T.Vector3(0, 0, -18),
  omega: new T.Vector3(),
  wind: new T.Vector3(),
  gas: 0.65,
  wing: 1,
  engine: 1,
  pitch: 0,
  roll: 0,
  yaw: 0,
});
function run(s, seconds) {
  let out;
  for (let i = 0; i < seconds * 120; i++) {
    out = stepFlight(T, s, 1 / 120);
    assert.ok([...s.vel.toArray(), ...s.q.toArray()].every(Number.isFinite));
  }
  return out;
}
for (const direction of [-1, 1]) {
  const s = state();
  s.roll = direction;
  let total = 0,
    inverted = false;
  for (let i = 0; i < 480; i++) {
    const before = s.q.clone();
    stepFlight(T, s, 1 / 120);
    total += before.angleTo(s.q);
    if (new T.Vector3(0, 1, 0).applyQuaternion(s.q).y < -0.8) inverted = true;
  }
  assert.ok(inverted && total > Math.PI * 2, 'unrestricted full roll');
  const hold = state();
  hold.roll = direction;
  run(hold, 0.5);
  hold.roll = 0;
  run(hold, 0.7);
  const q = hold.q.clone();
  run(hold, 1);
  assert.ok(q.angleTo(hold.q) < 0.002, 'no auto-level or automatic yaw after release');
  const rudder = state();
  rudder.yaw = direction;
  run(rudder, 0.8);
  assert.ok(
    new T.Vector3(0, 0, -1).applyQuaternion(rudder.q).x * direction > 0.2,
    'independent rudder',
  );
  assert.ok(Math.abs(rudder.omega.z) < 0.001, 'rudder does not command roll');
}
const pull = state();
pull.pitch = 1;
run(pull, 1);
assert.ok(new T.Vector3(0, 0, -1).applyQuaternion(pull.q).y > 0.4);
const slow = state();
slow.vel.set(0, 0, -3);
assert.ok(stepFlight(T, slow, 1 / 120).authority < 0.3);
const stalled = state();
stalled.vel.set(0, -15, -10);
assert.ok(stepFlight(T, stalled, 1 / 120).stall < 0.3);
const damaged = state();
damaged.wing = 0;
assert.ok(stepFlight(T, damaged, 1 / 120).authority < 0.6);
const barrel = state();
barrel.roll = 1;
barrel.pitch = 0.4;
run(barrel, 60);
assert.equal(deadzone(0.1), 0);
assert.equal(deadzone(-1), -1);
assert.equal(deadzone(NaN), 0);
const buttons = Array.from({ length: 17 }, () => ({ value: 0 }));
buttons[0].value = 1;
buttons[7].value = 0.7;
const gp = { connected: true, mapping: 'standard', axes: [0.8, 0.5, -0.7, 0], buttons };
let p = readPad([null, gp]);
assert.ok(p.connected && p.roll < 0 && p.pitch > 0 && p.yaw < 0 && p.fire && p.throttle === 0.7);
assert.equal(readPad([null]).fire, false);
assert.equal(readPad([{ ...gp, connected: false }]).roll, 0);
assert.equal(readPad([{ ...gp, mapping: '' }]).connected, false);
assert.equal(readPad([{ ...gp, axes: [0.05, -0.05, 0.02] }]).roll, 0);
buttons[5].value = 1;
assert.equal(readPad([{ ...gp, axes: [0, 0, 0] }]).yaw, 1);
for (const path of ['flight', 'input']) {
  const r = await worker.fetch(new Request('https://test.local/' + path + '.js'), {});
  assert.equal(r.status, 200);
  assert.match(await r.text(), /export /);
}
console.log(
  'PASS: manual three axes, both full rolls, no auto-level, independent rudder, pitch, stall, damage, combined aerobatics and 60s stability.',
);
console.log(
  'PASS: analog gamepad axes, dead zone, triggers, fire, shoulders, disconnect, unsupported mapping and served modules.',
);
