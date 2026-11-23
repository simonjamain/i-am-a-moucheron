import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ControlFocus,
  airplaneSteering,
  equipmentExitAction,
  gameKey,
  flightInput,
  lookDelta,
  lookScale,
  BASE_FOV,
} from '../src/control-focus.ts';
for (const [letter, arrow, axis] of [
  ['KeyZ', 'ArrowUp', 'pitch'],
  ['KeyS', 'ArrowDown', 'pitch'],
  ['KeyQ', 'ArrowLeft', 'roll'],
  ['KeyD', 'ArrowRight', 'roll'],
]) {
  assert.equal(flightInput({ [letter]: true })[axis], flightInput({ [arrow]: true })[axis]);
}
assert.equal(flightInput({ KeyZ: true, KeyS: false }).throttle, 0);
assert.equal(flightInput({ ShiftLeft: true }).throttle, 1);
assert.equal(flightInput({ ControlRight: true }).throttle, -1);
assert.equal(flightInput({ KeyA: true }).yaw, -1);
assert.equal(flightInput({ KeyQ: true }).yaw, 0);
assert.equal(gameKey({ key: 'z', code: 'KeyW' }), 'KeyZ');
assert.equal(gameKey({ key: 'Q', code: 'KeyA' }), 'KeyQ');
assert.equal(gameKey({ key: 'a', code: 'KeyQ' }), 'KeyA');
assert.deepEqual(flightInput({ KeyZ: true, ShiftLeft: true, Space: true }, false), {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
});
// Regression: client previously read manual input but sent mouse-only axes to flight physics.
const assisted = { pitch: 0.4, roll: -0.6, yaw: 0.7 };
assert.deepEqual(airplaneSteering(assisted, flightInput({})), assisted);
for (const [key, axis] of [
  ['KeyZ', 'pitch'],
  ['ArrowUp', 'pitch'],
  ['KeyS', 'pitch'],
  ['ArrowDown', 'pitch'],
  ['KeyQ', 'roll'],
  ['ArrowLeft', 'roll'],
  ['KeyD', 'roll'],
  ['ArrowRight', 'roll'],
  ['KeyA', 'yaw'],
  ['KeyE', 'yaw'],
]) {
  const manual = flightInput({ [key]: true });
  const steering = airplaneSteering(assisted, manual);
  assert.equal(steering[axis], manual[axis], key + ' must override mouse assistance');
  for (const other of ['pitch', 'roll', 'yaw'].filter((name) => name !== axis))
    assert.equal(steering[other], assisted[other], other + ' remains assisted');
}
assert.deepEqual(
  airplaneSteering(assisted, flightInput({ KeyZ: true, KeyA: true }, false)),
  assisted,
  'released pointer/form input cannot steer',
);
assert.ok(
  readFileSync(new URL('../src/client.js', import.meta.url), 'utf8').includes(
    'const steering = airplaneSteering(auto, manual);',
  ),
  'client flight integration must use manual axes',
);
console.log('PASS: airplane keyboard, arrows and gamepad override mouse steering per axis.');
const handlers = new Map();
let changes = [],
  allowed = true,
  requests = 0,
  exits = 0;
const document = {
  pointerLockElement: null,
  addEventListener: (name, fn) => handlers.set(name, fn),
  exitPointerLock() {
    exits++;
    this.pointerLockElement = null;
    handlers.get('pointerlockchange')();
  },
};
const canvas = {
  focus() {},
  requestPointerLock() {
    requests++;
    document.pointerLockElement = this;
    handlers.get('pointerlockchange')();
  },
};
const focus = new ControlFocus({
  canvas,
  document,
  onChange: (active) => changes.push(active),
  allowed: () => allowed,
});
await focus.capture();
assert.equal(focus.active, true);
focus.release();
assert.equal(focus.active, false);
assert.equal(exits, 1);
// Escape/native unlock must not trigger a recapture.
assert.equal(requests, 1);
await focus.capture();
document.pointerLockElement = null;
handlers.get('pointerlockchange')();
assert.equal(focus.active, false);
assert.equal(requests, 2);
allowed = false;
await focus.capture();
assert.equal(requests, 2, 'forms/help block capture');
// A pending native capture cannot take the cursor back after a form opens.
allowed = true;
canvas.requestPointerLock = () => {
  requests++;
};
await focus.capture();
allowed = false;
focus.release();
document.pointerLockElement = canvas;
handlers.get('pointerlockchange')();
assert.equal(focus.active, false);
assert.equal(document.pointerLockElement, null);
const look = { yaw: 0, pitch: 0 };
lookDelta(look, 100, 100);
assert.ok(look.yaw < 0 && look.pitch < 0);
lookDelta(look, 0, 10000);
assert.equal(look.pitch, -1.2);
console.log(
  'PASS: logical AZERTY keys, ZQSD/arrows, independent Shift/Ctrl throttle, A/E rudder, neutral UI controls, explicit capture/unlock and form capture race',
);

let failed = 0;
const denied = new ControlFocus({
  canvas: { requestPointerLock: () => Promise.reject(Error('denied')) },
  document: { addEventListener() {} },
  onError: () => failed++,
});
await denied.capture();
assert.equal(denied.active, false);
assert.equal(failed, 1);
assert.equal(denied.pending, false);
// Desktop-first: no touch mode, a former touch option changes nothing and
// activation only follows a real Pointer Lock.
let locked = 0;
const touch = new ControlFocus({
  canvas: { requestPointerLock: async () => locked++ },
  document: { addEventListener() {} },
  touch: true,
});
assert.equal(touch.active, false);
await touch.capture();
assert.equal(locked, 1);
assert.equal(touch.active, false, 'active only after pointerlockchange');
console.log('PASS: capture denial stays in UI mode; no touch mode without Pointer Lock');

for (const seat of ['pilot', 'dorsal', 'tail']) {
  assert.equal(
    equipmentExitAction({ key: 'KeyF', vehicle: { seat }, onFoot: seat !== 'pilot' }),
    'vehicle-exit',
  );
}
assert.equal(equipmentExitAction({ key: 'KeyF', turret: 0 }), 'turret');
assert.equal(equipmentExitAction({ key: 'KeyF', vehicle: {}, formOpen: true }), null);
assert.equal(equipmentExitAction({ key: 'KeyF', vehicle: {}, repeat: true }), null);
console.log('PASS: F exits all bomber seats even when crew mode is onFoot or cursor is free.');

assert.equal(flightInput({ KeyE: true }).yaw, 1);
assert.equal(flightInput({ KeyA: true }).yaw, -1);
// Harmonised controls (docs/controls.md): one verb per input. The click uses what is
// outlined (E no longer interacts: A/E are only the rudder), R never kills, Tab opens
// the wave window, Space is a secondary weapon (never the gunners' fire), no gamepad.
{
  const client = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    client,
    /code === 'KeyE'|'KeyE', 'Enter'|interactionKey === 'KeyE'/,
    'E interacts no more',
  );
  assert.doesNotMatch(client, /KeyR'[^\n]*crash\(\)/, 'R never kills');
  assert.match(
    client,
    /event\.code === 'Tab'[^\n]*waveCouncil|event\.code === 'Tab' &&/,
    'Tab opens the wave window',
  );
  assert.doesNotMatch(
    client,
    /interactionKey === 'KeyV' &&\s*!event\.repeat &&\s*!waveCouncil/,
    'V only switches views',
  );
  assert.doesNotMatch(client, /readPad|getGamepads|\bpad\./, 'no gamepad');
  assert.doesNotMatch(client, /mouseFire \|\| keys\.Space/, "Space is not the gunners' fire");
}
console.log('PASS: A/E only steer, the click interacts, R never kills, Tab: wave, no gamepad.');

// Zoomed view: a mouse count must move the picture by the same number of pixels.
assert.equal(lookScale(BASE_FOV), 1);
assert.equal(lookScale(120), 1, 'a wider view never makes the mouse faster');
assert.ok(
  Math.abs(lookScale(28) - Math.tan((28 * Math.PI) / 360) / Math.tan((62 * Math.PI) / 360)) < 1e-12,
);
assert.equal(lookScale(0), 1);
assert.equal(lookScale(Number.NaN), 1);
{
  const wide = { yaw: 0, pitch: 0 },
    zoomed = { yaw: 0, pitch: 0 };
  lookDelta(wide, 10, 0);
  lookDelta(zoomed, 10, 0, lookScale(28));
  // Pixels moved = angle / fov-per-pixel; the ratio of angles equals the ratio of tan(fov/2).
  const pixels = (angle, fov) => Math.tan(angle) / Math.tan((fov * Math.PI) / 360);
  assert.ok(
    Math.abs(pixels(zoomed.yaw, 28) - pixels(wide.yaw, 62)) / Math.abs(pixels(wide.yaw, 62)) < 0.01,
  );
}
console.log('Mouse look: sensitivity follows the field of view (same pixels per count zoomed).');
