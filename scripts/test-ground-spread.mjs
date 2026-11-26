// Ground packs spread through physical avoidance, with no display-only lanes.
import assert from 'node:assert/strict';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { prepareRoster } from '../server/wave-preparation.ts';
import { DEFAULT_BALANCE } from '../src/balance.ts';
import { advanceGroundCrowd } from '../src/ground-crowd.ts';
import { newGroundDefense, groundFlow } from '../src/ground-defense-state.ts';
import { swarmFrame } from '../src/waves.ts';
import { INSECT_SCALE, enemySizeFactor } from '../src/scale.ts';

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
// Each seed runs in its own worker (about 4 s of CPU each): same scenarios and
// threshold, the suite's slowest script no longer serialises them.
const SEEDS = [1, 2, 3, 4, 5, 6];
function closestPair(seed) {
  let closest = Infinity;
  const { roster } = prepareRoster(10, DEFAULT_BALANCE, seeded(seed));
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
  return closest;
}
if (!isMainThread) {
  parentPort.postMessage(closestPair(workerData));
  process.exit(0);
}
const pairs = await Promise.all(
  SEEDS.map(
    (seed) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: seed });
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => code && reject(new Error(`seed ${seed} exited ${code}`)));
      }),
  ),
);
const closest = Math.min(...pairs);
const radius = INSECT_SCALE * 0.8 * enemySizeFactor('ant') * 0.9;
// After one second to emerge from the shared portal, bodies must have spread.
// Soft contacts may overlap briefly at spawn, but must never remain stacked.
assert.ok(
  closest > radius * 0.8,
  `closest pair ${closest.toFixed(4)} vs body radius ${radius.toFixed(4)}`,
);
console.log('Ground spread: physical crowd; closest pair', closest.toFixed(4));
