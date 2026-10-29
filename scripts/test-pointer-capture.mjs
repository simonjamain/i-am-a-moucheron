import assert from 'node:assert/strict';
import { flightClickAction } from '../src/mouse-flight.js';
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
