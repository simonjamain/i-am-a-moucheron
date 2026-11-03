import { feedingPoint } from '../src/ground-defense-state.js';
import assert from 'node:assert/strict';
import { advanceGroundUnit } from '../src/ground-creatures.js';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.js';

const unit = (p = [0, 0]) => ({
  id: 1,
  p: [...p],
  dir: [0, 0],
  tasted: [],
  baitId: null,
  eatingUntil: 0,
  stuckUntil: 0,
  stickyInside: [],
  arrived: false,
  attackId: null,
});
const enemy = (type) => ({ id: 1, type, speedMps: 0.1, travelSpeed: 0.1 });
const direct = { nextStep: () => [1, 0] };
const tape = {
  id: 'tape',
  kind: 'sticky',
  a: [0.05, -0.1],
  b: [0.05, 0.1],
  width: 0.03,
};
const positions = {};
for (const type of ['ant', 'roach', 'rat']) {
  const actor = unit();
  const world = {
    structures: [tape],
    goalFlow: direct,
    baitFlow: () => null,
    damageWall: () => assert.fail('tape is not a wall'),
  };
  for (let step = 0; step < 30; step++) {
    advanceGroundUnit(actor, enemy(type), (step + 1) * 0.2, 0.2, world);
  }
  positions[type] = actor.p[0];
}
assert.ok(
  positions.ant < positions.roach && positions.roach < positions.rat,
  'small insect pauses, medium slows down, large travels nearly normally',
);
assert.ok(positions.ant > 0.2, 'temporary glue cannot hold a small insect forever');

const damage = {};
for (const type of ['ant', 'roach', 'rat']) {
  const actor = unit();
  const wall = {
    id: 'wall',
    kind: 'barricade',
    a: [0.02, -0.2],
    b: [0.02, 0.2],
    hp: 100,
  };
  const world = {
    structures: [wall],
    goalFlow: { nextStep: () => null },
    baitFlow: () => null,
    damageWall: (id, amount) => {
      assert.equal(id, 'wall');
      wall.hp = Math.max(0, wall.hp - amount);
    },
  };
  advanceGroundUnit(actor, enemy(type), 1, 1, world);
  damage[type] = 100 - wall.hp;
  assert.equal(actor.attackId, 'wall');
}
assert.equal(damage.ant, 0, 'ants cannot break a complete blockade');
assert.ok(damage.roach > 0 && damage.rat > damage.roach);

const state = newGroundDefense();
const bait = {
  id: 'bait',
  kind: 'sugar',
  type: 'sugar',
  position: [3, -2.95],
  radius: 0.15,
};
state.structures.push(bait);
const meal = unit([3, -3]);
const world = {
  structures: state.structures,
  goalFlow: groundFlow(state),
  baitFlow: () => groundFlow(state, feedingPoint(bait)),
  damageWall: () => assert.fail('no wall during meal'),
};
let firstTarget = null;
for (let step = 0; step < 60; step++) {
  advanceGroundUnit(meal, enemy('ant'), (step + 1) * 0.2, 0.2, world);
  if (step === 0) firstTarget = meal.baitId;
}
assert.equal(firstTarget, 'bait', 'the first available food is selected');
assert.deepEqual(meal.tasted, ['sugar'], 'a food type is consumed exactly once');
assert.equal(meal.baitId, null, 'the creature resumes after its meal');
assert.equal(meal.arrived, true, 'the creature eventually reaches the bin');
console.log('PASS: permanent food satiation, sticky crossing and destructive blockade.');
