import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { supportedPlacement } from '../src/equipment.js';
import { stepHelicopter } from '../src/helicopter.js';
import { VEHICLES, vehiclePad, vehicleEntry, vehicleAccess } from '../src/fleet.js';
const floor = { min: { x: -1, y: -0.1, z: -1 }, max: { x: 1, y: 0, z: 1 } };
const point = { x: 0, y: 0, z: 0 };
const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('PASS:', name);
  } catch (e) {
    failures.push(name);
    console.error('FAIL:', name, e.message);
  }
}
check('station next to parked aircraft within service radius', () =>
  assert.ok(
    supportedPlacement(point, [floor], [{ x: 0.06, y: 0, z: 0, clearance: 0.03 }], 'refuel'),
  ),
);
check('equipment inside station service radius', () =>
  assert.ok(
    supportedPlacement({ ...point, x: 0.04 }, [floor], [{ ...point, kind: 'refuel' }], 'dca'),
  ),
);
check('station body still blocks placement', () =>
  assert.equal(supportedPlacement(point, [floor], [{ ...point, kind: 'refuel' }], 'dca'), null),
);
check('new helicopter stays boardable after neutral physics', () => {
  const state = { ...vehiclePad('helicopter'), p: [0, VEHICLES.helicopter.gear + 0.00005, 0] };
  for (let i = 0; i < 120; i++) stepHelicopter(T, state, {}, [floor], 1 / 120, VEHICLES.helicopter);
  assert.equal(state.landed, true);
  for (const seat of VEHICLES.helicopter.seats) {
    const e = vehicleEntry({ type: 'helicopter', state }, seat);
    assert.ok(vehicleAccess(e, { type: 'helicopter', state }, seat));
  }
});
assert.deepEqual(failures, []);
