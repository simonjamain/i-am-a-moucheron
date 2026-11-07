// Issue #102: fixed DCA fuse distance sweeps continuously while Shift/Ctrl is held.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceFuse, contextKey, FUSE_RATE, rangeReadout } from '../src/equipment-controls.js';
import { fuseRange } from '../src/combat.js';
import { FLAK } from '../src/scale.js';

const held = (...codes) => Object.fromEntries(codes.map((code) => [code, true]));
const frame = 1 / 60;
let range = FLAK.range;
for (let i = 0; i < 30; i++) range = advanceFuse(range, held('ShiftLeft'), frame);
assert.ok(Math.abs(range - (FLAK.range + FUSE_RATE * 0.5)) < 1e-6, 'Shift held increases smoothly');
assert.notEqual(range % FLAK.step, 0, 'no more 25 m steps');
const released = range;
for (let i = 0; i < 30; i++) range = advanceFuse(range, {}, frame);
assert.equal(range, released, 'release stops immediately');
range = advanceFuse(range, held('ControlRight'), 0.1);
assert.ok(Math.abs(range - (released - FUSE_RATE * 0.1)) < 1e-6, 'Ctrl held decreases');
assert.equal(advanceFuse(range, held('ShiftRight', 'ControlLeft'), 0.5), range, 'both keys cancel');
assert.equal(advanceFuse(FLAK.maxRange - 1, held('ShiftLeft'), 0.1), FLAK.maxRange);
assert.equal(advanceFuse(FLAK.minRange + 1, held('ControlLeft'), 0.1), FLAK.minRange);
assert.equal(
  advanceFuse(500, held('ShiftLeft'), 5),
  500 + FUSE_RATE * 0.1,
  'frame hitch is capped',
);
assert.equal(advanceFuse(500, held('ShiftLeft'), NaN), 500);
assert.equal(fuseRange(NaN), FLAK.range);
assert.equal(rangeReadout(437.5).metres, 437.5, 'live readout shows the exact distance');
const span = (FLAK.maxRange - FLAK.minRange) / FUSE_RATE;
assert.ok(span > 2 && span < 5, 'whole span reachable in a few seconds');
assert.deepEqual(contextKey({ turret: true }, 'ShiftLeft'), { fuse: 1 });
assert.deepEqual(contextKey({ turret: true }, 'ControlRight'), { fuse: -1 });

// Client: the key is held (not stepped) and only the occupied fixed DCA sweeps,
// while focus is captured. Focus loss and seat changes clear held keys.
const client = readFileSync('src/client.js', 'utf8');
const handler = client.slice(
  client.indexOf('if (contextual.fuse) {'),
  client.indexOf('} else if (contextual.heliWeapon)'),
);
assert.match(handler, /keyBindings\.set\(event\.code, code\);\s*keys\[code\] = true;/);
assert.doesNotMatch(handler, /flakRange/);
assert.match(
  client,
  /if \(controlFocus\.active\) \{\s*if \(station\.kind === 'dca'\) flakRange = advanceFuse\(flakRange, keys, dt\);/,
);
const clear = client.slice(
  client.indexOf('function clearControls() {'),
  client.indexOf('const keyBindings = new Map()'),
);
assert.match(clear, /keys\[key\] = false/);
console.log(
  'DCA fuse: continuous Shift/Ctrl sweep, instant stop, cancel, bounds and live readout.',
);
