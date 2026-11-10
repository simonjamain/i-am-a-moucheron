import assert from 'node:assert/strict';
import { loadBaselineGame } from './baseline-game.mjs';
import { performance } from 'node:perf_hooks';
import { Game } from '../server/game.js';

const baseline = '2f02d128997b8ffadfc9f4ba43afd1b6ebfe3442';
const PreviousGame = await loadBaselineGame(baseline, 'snapshot');
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
for (let i = 0; i < 80; i++) fixture.soul(room, 'enemy', 'enemy-' + i, 'Moucheron');
fixture.arena(room, 'purgatory');
const before = new PreviousGame({ now: clock });
const after = new Game({ now: clock });
// Isolate snapshot construction, not the simulation's advance rate.
before.advance = () => {};
after.advance = () => {};
// The baseline still reads the annex records removed since (malicious contracts).
room.dossiers = new Map();
const { dossiers, ...original } = before.snapshot(room);
assert.deepEqual(dossiers, [], 'no annex record in the fixture');
original.pilots = original.pilots.map(({ contractClause, ...pilot }) => {
  assert.equal(contractClause, null, 'no contract clause in the fixture');
  return pilot;
});
const optimized = after.snapshot(room);
const {
  rosterRevision,
  groundDefense,
  groundAgents,
  preparation,
  groundNavigationActive,
  ...comparable
} = optimized;
assert.equal(preparation, null, 'before mission launch there is no forecast');
assert.equal(groundNavigationActive, false);
assert.deepEqual(groundAgents, {}, 'a room without constructions keeps legacy enemy routes');
assert.equal(rosterRevision, 0, 'new roster revision defaults to zero');
assert.deepEqual(
  groundDefense,
  { revision: 0, navigationRevision: 0, structures: [] },
  'new ground state is isolated and initially empty',
);
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
console.log(
  JSON.stringify({
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
  }),
);
