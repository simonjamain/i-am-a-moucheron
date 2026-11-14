// Ground packs spread through physical avoidance, with no display-only lanes.
import assert from 'node:assert/strict';
import { prepareRoster } from '../server/wave-preparation.js';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { advanceGroundCrowd } from '../src/ground-crowd.js';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.js';
import { swarmFrame } from '../src/waves.js';
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
    advanceGroundCrowd(units, ants, new Set(), Math.max(0, time - 0.1), time, world);
    const frames = swarmFrame(ants, time, units);
    const live = frames.filter(
      (f, i) =>
        f &&
        units[ants[i].id] &&
        !units[ants[i].id].arrived &&
        time - ants[i].spawn - ants[i].entryHold > 1,
    );
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++)
        closest = Math.min(
          closest,
          Math.hypot(live[i].p[0] - live[j].p[0], live[i].p[2] - live[j].p[2]),
        );
  }
}
const radius = INSECT_SCALE * 0.8 * enemySizeFactor('ant') * 0.9;
// After one second to emerge from the shared portal, bodies must have spread.
// Soft contacts may overlap briefly at spawn, but must never remain stacked.
assert.ok(
  closest > radius * 0.8,
  `closest pair ${closest.toFixed(4)} vs body radius ${radius.toFixed(4)}`,
);
console.log('Ground spread: physical crowd; closest pair', closest.toFixed(4));
