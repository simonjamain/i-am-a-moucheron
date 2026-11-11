// Ground packs spread out: members leave the portal one after the other and
// walk in lanes, so no two creatures of a pack are drawn on top of each other.
import assert from 'node:assert/strict';
import { prepareRoster } from '../server/wave-preparation.js';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { groundUnit, advanceGroundUnit } from '../src/ground-creatures.js';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.js';
import { swarmFrame, groundLaneOffset, GROUND_LANES } from '../src/waves.js';
import { INSECT_SCALE, enemySizeFactor } from '../src/scale.js';

const state = newGroundDefense();
const world = {
  structures: state.structures,
  goalFlow: groundFlow(state),
  baitFlow: () => null,
  damageWall: () => {},
};
const seeded = (seed) => (n) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((seed / 4294967296) * n);
};
let closest = Infinity;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const { roster } = prepareRoster(5, DEFAULT_BALANCE, seeded(seed));
  const ants = roster.filter((e) => e.type === 'ant');
  assert.ok(ants.length >= 40, 'a real pack of ants');
  const units = {};
  for (let time = 0; time < 40; time += 0.1) {
    for (const enemy of ants) {
      if (time < enemy.spawn + enemy.entryHold) continue;
      const unit = (units[enemy.id] ||= groundUnit(enemy, time));
      if (!unit.arrived) advanceGroundUnit(unit, enemy, time, 0.1, world);
    }
    const frames = swarmFrame(ants, time, units);
    const live = frames.filter((f, i) => f && !units[ants[i].id]?.arrived);
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++)
        closest = Math.min(
          closest,
          Math.hypot(live[i].p[0] - live[j].p[0], live[i].p[2] - live[j].p[2]),
        );
  }
}
const radius = INSECT_SCALE * 0.8 * enemySizeFactor('ant') * 0.9;
// Bodies are longer than wide: tolerate a slight overlap, never a stack.
assert.ok(
  closest > radius * 0.8,
  `closest pair ${closest.toFixed(4)} vs body radius ${radius.toFixed(4)}`,
);
// Lanes stay inside the route clearance around furniture (2.5 cm).
for (const [type, lanes] of Object.entries(GROUND_LANES)) {
  const offsets = Array.from({ length: lanes * 4 }, (_, id) =>
    Math.abs(groundLaneOffset({ id, type, size: 1 })),
  );
  assert.ok(Math.max(...offsets) < 0.045, type + ' ribbon width ' + Math.max(...offsets));
}
console.log('Ground spread: packs leave one by one in lanes; closest pair', closest.toFixed(4));
