import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flightClickAction } from '../src/mouse-flight.js';
import { ControlFocus } from '../src/control-focus.js';
const mouse = { button: 0, pointerType: 'mouse' };
assert.equal(flightClickAction(mouse, { active: true, locked: false }), 'capture');
assert.equal(flightClickAction(mouse, { active: true, locked: true }), 'fire');
assert.equal(flightClickAction(mouse, { active: false, locked: false }), null);
assert.equal(
  flightClickAction({ button: 2, pointerType: 'mouse' }, { active: true, locked: false }),
  null,
);
assert.equal(
  flightClickAction({ button: 0, pointerType: 'touch' }, { active: true, locked: false }),
  null,
);
console.log(
  'PASS: first flight click captures, locked click fires, inactive/right/touch input does neither',
);

// Desktop-first (no touch mode): a touch-screen PC captures the mouse like any
// other, and no on-screen touch controls exist.
const listeners = {};
let locks = 0;
const canvas = { requestPointerLock: async () => locks++, focus() {} };
const focus = new ControlFocus({
  canvas,
  document: { addEventListener: (type, fn) => (listeners[type] = fn), pointerLockElement: null },
});
assert.equal(focus.active, false, 'never active before a real pointer lock');
await focus.capture();
assert.equal(locks, 1, 'capture always requests Pointer Lock');
const client = readFileSync('src/client.js', 'utf8'),
  page = readFileSync('src/index.html', 'utf8');
assert.doesNotMatch(client, /pointer:\s*coarse|controlFocus\.touch/);
assert.doesNotMatch(page, /pointer:\s*coarse|id="touch"|id="footTouch"/);
console.log('PASS: desktop-first pointer capture, no touch mode or touch controls');
