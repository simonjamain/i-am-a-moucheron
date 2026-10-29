import assert from 'node:assert/strict';
import {
  createSoul,
  advanceArena,
  mergeOwnedArena,
  bodyMotion,
  relayBodyReport,
} from '../src/purgatory-physics.js';
for (const delay of [40, 160, 320, 1500]) {
  const b = createSoul({ id: 1, entity: 'me', kind: 'player' }, 0, 1000);
  b.x = 0;
  b.z = 10;
  let a = {
    epoch: 'same',
    time: 1000,
    bounds: { minX: -100, maxX: 100, minZ: 0, maxZ: 80 },
    eventSeq: 0,
    events: [],
    bodies: [b],
  };
  let previous = 0;
  for (let tick = 1; tick <= 180; tick++) {
    const me = a.bodies[0];
    me.input = { x: 1, z: 0 };
    me.inputAt = a.time;
    advanceArena(a, a.time + 1000 / 60, 'me');
    assert.ok(me.x >= previous);
    previous = me.x;
    if (tick % 6 === 0) {
      const old = {
        epoch: 'same',
        bounds: { minX: -100, maxX: 100, minZ: 0, maxZ: 80 },
        time: a.time - delay,
        bodies: [
          {
            ...createSoul({ id: 1, entity: 'me', kind: 'player' }, 0, 1000),
            x: 0,
            z: 10,
            paper: 1,
          },
        ],
        events: [],
        eventSeq: 0,
      };
      a = mergeOwnedArena(old, a, 'me');
      assert.equal(a.bodies[0].x, previous, 'a delayed snapshot must never change local position');
      assert.equal(a.bodies[0].paper, 1);
    }
  }
  assert.ok(a.bodies[0].x > 8);
  const reset = mergeOwnedArena({ epoch: 'new', time: 4000, bodies: [b], events: [] }, a, 'me');
  assert.equal(reset.epoch, 'new');
  assert.equal(reset.time, 4000);
}
const a = {
  epoch: 'e',
  time: 1000,
  events: [],
  eventSeq: 0,
  bodies: [
    createSoul({ id: 1, entity: 'a', kind: 'player' }, 0, 1000),
    createSoul({ id: 2, entity: 'b', kind: 'player' }, 1, 1000),
  ],
};
console.log('PASS: owned movement remains stable under delayed snapshots.');
