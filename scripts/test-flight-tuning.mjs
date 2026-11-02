import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  DEFAULT_FLIGHT_TUNING,
  FLIGHT_TUNING_STORAGE_KEY,
  loadFlightTuning,
  normalizeFlightTuning,
  saveFlightTuning,
} from '../src/flight-tuning.js';
import { mouseFlightControls, rotateMouseAim } from '../src/mouse-flight.js';
import worker from '../worker/index.js';

const data = new Map();
const storage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
};
assert.deepEqual(loadFlightTuning(storage), DEFAULT_FLIGHT_TUNING);
assert.equal(saveFlightTuning(storage, { ...DEFAULT_FLIGHT_TUNING, pitchResponse: 1.9 }), true);
assert.equal(JSON.parse(data.get(FLIGHT_TUNING_STORAGE_KEY)).pitchResponse, 1.9);
assert.equal(loadFlightTuning(storage).pitchResponse, 1.9);
data.set(FLIGHT_TUNING_STORAGE_KEY, '{');
assert.deepEqual(loadFlightTuning(storage), DEFAULT_FLIGHT_TUNING);
data.set(
  FLIGHT_TUNING_STORAGE_KEY,
  JSON.stringify({ mouseSensitivity: Infinity, yawResponse: -20, invertY: 'true' }),
);
assert.equal(loadFlightTuning(storage).yawResponse, 0.4);
assert.equal(loadFlightTuning(storage).mouseSensitivity, 1);
assert.equal(loadFlightTuning(storage).invertY, false);
assert.deepEqual(normalizeFlightTuning(null), DEFAULT_FLIGHT_TUNING);
const inaccessible = {
  getItem() {
    throw Error('blocked');
  },
  setItem() {
    throw Error('blocked');
  },
};
assert.deepEqual(loadFlightTuning(inaccessible), DEFAULT_FLIGHT_TUNING);
assert.equal(saveFlightTuning(inaccessible, DEFAULT_FLIGHT_TUNING), false);

const direction = new T.Vector3(0.03, 0.01, -1).normalize();
const state = { q: new T.Quaternion(), omega: new T.Vector3(), direction };
const baseline = mouseFlightControls(T, state, { ...DEFAULT_FLIGHT_TUNING, nearTargetBoost: 1 });
const quicker = mouseFlightControls(T, state, DEFAULT_FLIGHT_TUNING);
assert.ok(quicker.yaw > baseline.yaw, 'default near-target boost speeds up final yaw convergence');
assert.ok(quicker.pitch > baseline.pitch, 'default near-target boost speeds up final pitch convergence');
const sensitive = mouseFlightControls(T, state, { ...DEFAULT_FLIGHT_TUNING, yawResponse: 2 });
assert.ok(sensitive.yaw > quicker.yaw);
const damped = mouseFlightControls(
  T,
  { ...state, omega: new T.Vector3(0, 0.3, 0) },
  { ...DEFAULT_FLIGHT_TUNING, damping: 2 },
);
const lightlyDamped = mouseFlightControls(
  T,
  { ...state, omega: new T.Vector3(0, 0.3, 0) },
  { ...DEFAULT_FLIGHT_TUNING, damping: 0.4 },
);
assert.ok(damped.yaw > lightlyDamped.yaw);
const original = new T.Vector3(0, 0, -1);
const fast = original.clone();
rotateMouseAim(T, original, new T.Quaternion(), 60, -40, 0.0026);
rotateMouseAim(T, fast, new T.Quaternion(), 60, -40, 0.0026 * 2);
assert.ok(fast.x > original.x && fast.y > original.y);
const inverted = new T.Vector3(0, 0, -1);
rotateMouseAim(T, inverted, new T.Quaternion(), 60, 40, 0.0026);
assert.ok(inverted.y < 0, 'negative vertical direction is available at the input boundary');
for (const path of ['/flight-tuning.js', '/flight-tuning-ui.js']) {
  const response = await worker.fetch(new Request('https://test.local' + path), {});
  assert.equal(response.status, 200);
}
console.log(
  'PASS: local flight preferences, invalid/blocked storage, near-target boost, axis response, damping and mouse input.',
);
