import assert from 'node:assert/strict';
import { advanceGroundUnit, crossedSticky, GROUND_ATTACK_DAMAGE } from '../src/ground-creatures.js';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.js';

const state = newGroundDefense();
const goalFlow = groundFlow(state);
const example = { id: 1, type: 'ant', speedMps: 0.1, travelSpeed: 0.1 };
const unit = {
  id: 1,
  p: [2.5, -2.7],
  dir: [0, 0],
  tasted: [],
  baitId: null,
  eatingUntil: 0,
  stuckUntil: 0,
  stickyInside: [],
  arrived: false,
  attackId: null,
};
const world = {
  structures: state.structures,
  goalFlow,
  baitFlow: () => null,
  damageWall: () => { throw Error('No barricade should be hit'); },
};
const old = [...unit.p];
advanceGroundUnit(unit, example, 1, 1, world);
assert.ok(unit.p[0] > old[0], 'an ant moves toward the bin');
assert.ok(!unit.arrived);
assert.ok(crossedSticky([0, 0], [0.1, 0], { a: [0.05, -0.1], b: [0.05, 0.1], width: 0.03 }));
assert.ok(!crossedSticky([0, 0], [0.1, 0], { a: [0.5, -0.1], b: [0.5, 0.1], width: 0.03 }));
assert.equal(GROUND_ATTACK_DAMAGE.ant, undefined);
assert.ok(GROUND_ATTACK_DAMAGE.roach > 0 && GROUND_ATTACK_DAMAGE.rat > GROUND_ATTACK_DAMAGE.roach);
console.log('Ground creature navigation: OK');
