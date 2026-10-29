import assert from 'node:assert/strict';
import {
  ControlFocus,
  equipmentExitAction,
  equipmentEnterAllowed,
  gameKey,
  flightInput,
  lookDelta,
} from '../src/control-focus.js';
import { neutralPad } from '../src/input.js';
const pad = neutralPad();
for (const [letter, arrow, axis] of [
  ['KeyZ', 'ArrowUp', 'pitch'],
  ['KeyS', 'ArrowDown', 'pitch'],
  ['KeyQ', 'ArrowLeft', 'roll'],
  ['KeyD', 'ArrowRight', 'roll'],
]) {
  assert.equal(
    flightInput({ [letter]: true }, pad)[axis],
    flightInput({ [arrow]: true }, pad)[axis],
  );
}
assert.equal(flightInput({ KeyZ: true, KeyS: false }, pad).throttle, 0);
assert.equal(flightInput({ ShiftLeft: true }, pad).throttle, 1);
assert.equal(flightInput({ ControlRight: true }, pad).throttle, -1);
assert.equal(flightInput({ KeyA: true }, pad).yaw, -1);
assert.equal(flightInput({ KeyQ: true }, pad).yaw, 0);
assert.equal(gameKey({ key: 'z', code: 'KeyW' }), 'KeyZ');
assert.equal(gameKey({ key: 'Q', code: 'KeyA' }), 'KeyQ');
assert.equal(gameKey({ key: 'a', code: 'KeyQ' }), 'KeyA');
assert.deepEqual(
  flightInput({ KeyZ: true, ShiftLeft: true, Space: true }, { ...pad, roll: 1, fire: true }, false),
  { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false },
);
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
const touch = new ControlFocus({ canvas: {}, document: { addEventListener() {} }, touch: true });
touch.release();
assert.equal(touch.active, false);
await touch.capture();
assert.equal(touch.active, true);
console.log('PASS: capture denial stays in UI mode; touch can resume after closing a panel');

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

for (const seat of ['pilot', 'dorsal', 'tail'])
  assert.equal(equipmentEnterAllowed({ onFoot: seat !== 'pilot', vehicle: { seat } }), false);
assert.equal(equipmentEnterAllowed({ onFoot: true, turret: 0 }), false);
assert.equal(equipmentEnterAllowed({ onFoot: true }), true);
assert.equal(flightInput({ KeyE: true }, pad).yaw, 1);
assert.equal(flightInput({ KeyA: true }, pad).yaw, -1);
console.log('PASS: E only enters on foot, never exits or steals aircraft rudder A/E.');
