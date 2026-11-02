import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Game } from '../server/game.js';

const baseline = '2f02d128997b8ffadfc9f4ba43afd1b6ebfe3442';
const temporary = new URL('../server/.snapshot-baseline-benchmark.mjs', import.meta.url);
const oldSource = execFileSync('git', ['show', baseline + ':server/game.js'], {
  encoding: 'utf8',
});
writeFileSync(temporary, oldSource);
let PreviousGame;
try {
  ({ Game: PreviousGame } = await import(temporary.href));
} finally {
  unlinkSync(temporary);
}
const clock = () => 100000;
const fixture = new Game({ now: clock });
for (let i = 0; i < 50; i++) fixture.join({ code: 'PERF50', name: 'Player ' + i });
const room = fixture.rooms.get('PERF50');
for (let i = 0; i < 75; i++)
  room.purchases.set('pending-' + i, {
    token: 'pending-' + i,
    item: 'radar',
    owner: [...room.pilots.keys()][i % 50],
    price: 4,
    placed: false,
  });
for (let i = 0; i < 80; i++)
  fixture.soul(room, 'enemy', 'enemy-' + i, 'Moucheron');
fixture.arena(room, 'purgatory');
const before = new PreviousGame({ now: clock });
const after = new Game({ now: clock });
// Isolate snapshot construction, not the simulation's advance rate.
before.advance = () => {};
after.advance = () => {};
const original = before.snapshot(room);
const optimized = after.snapshot(room);
const { rosterRevision, ...comparable } = optimized;
assert.equal(rosterRevision, 0, 'new roster revision defaults to zero');
assert.deepEqual(comparable, original, 'snapshot wire structure and values must match baseline');
const sample = (engine) => {
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) engine.snapshot(room);
  return performance.now() - t0;
};
for (let i = 0; i < 3; i++) {
  sample(before);
  sample(after);
}
const times = { before: [], after: [] };
for (let i = 0; i < 11; i++) {
  if (i % 2) {
    times.after.push(sample(after));
    times.before.push(sample(before));
  } else {
    times.before.push(sample(before));
    times.after.push(sample(after));
  }
}
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const beforeMs = median(times.before);
const afterMs = median(times.after);
console.log(JSON.stringify({
  baseline,
  players: 50,
  pendingPurchases: room.purchases.size,
  souls: room.souls.size,
  samples: 11,
  snapshotsPerSample: 100,
  baselineMsPerSnapshot: +(beforeMs / 100).toFixed(4),
  currentMsPerSnapshot: +(afterMs / 100).toFixed(4),
  speedup: +(beforeMs / afterMs).toFixed(2),
  scope: 'CPU snapshot only, no UDP, physics advance or WebGL',
}));
