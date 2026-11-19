import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { ASSETS } from '../server/assets.js';
import {
  aircraftBay,
  baseBody,
  baseAccess,
  advanceBase,
  reconcileBase,
  baseWorld,
} from '../src/base.js';
const bay = aircraftBay(0);
const p = { id: 'test', name: 'T', bay: 0, life: 'alive', mode: 'foot', board_paper: 0 };
p.state = JSON.stringify({
  parked: { p: [baseWorld(bay).x, OFFICE_LAYOUT.base.parkedY, baseWorld(bay).z] },
});
const arena = reconcileBase({ time: 1000 }, [p], 1000);
const body = arena.bodies[0];
body.x = bay.x;
body.z = bay.z;
advanceBase(arena, 1100);
assert.ok(
  Math.abs(body.x - bay.x) > 0.5 || Math.abs(body.z - bay.z) > 1.75,
  'aircraft hull is solid',
);
body.x = bay.entryX;
body.z = bay.entryZ;
assert.equal(baseAccess(body, bay), true);
assert.equal(baseWorld(body).y, OFFICE_LAYOUT.base.deckY);
for (let i = 0; i < 100; i++) {
  const b = aircraftBay(i);
  assert.ok(Math.abs(b.x) < 32 && b.z < 37);
}
assert.ok(ASSETS['/base.js'], 'base module is packaged');
console.log('PASS: base bodies, hull collision and boarding proximity, bay layout.');
