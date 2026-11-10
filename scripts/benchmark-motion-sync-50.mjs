import assert from 'node:assert/strict';
import { loadBaselineGame } from './baseline-game.mjs';
import { performance } from 'node:perf_hooks';
import { Game } from '../server/game.js';

const baseline = '187c5228ce2fd945d63f1dacbf73c04556a2f094';
const PreviousGame = await loadBaselineGame(baseline, 'motion');
const now = () => 100000;
const fixture = new Game({ now });
for (let i = 0; i < 50; i++) fixture.join({ code: 'MOVE50', name: 'Player ' + i });
const room = fixture.rooms.get('MOVE50');
const player = [...room.pilots.values()][0];
const vehicle = fixture.createVehicle(room, 'fighter', 'purchase');
player.mode = 'flight';
player.vehicle_id = vehicle.id;
player.seat = 'pilot';
vehicle.seats.set('pilot', player.id);
const state = vehicle.state;
const before = new PreviousGame({ now });
const after = new Game({ now });
const invoke = (engine, count) => {
  const start = performance.now();
  for (let i = 0; i < count; i++) engine.sync(room, player, { mode: 'flight', state });
  return performance.now() - start;
};
invoke(before, 500);
invoke(after, 500);
const samples = { before: [], after: [] };
for (let i = 0; i < 11; i++) {
  if (i % 2) {
    samples.after.push(invoke(after, 1000));
    samples.before.push(invoke(before, 1000));
  } else {
    samples.before.push(invoke(before, 1000));
    samples.after.push(invoke(after, 1000));
  }
}
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const baselineMs = median(samples.before) / 1000;
const currentMs = median(samples.after) / 1000;
assert.equal(room.pilots.size, 50);
assert.deepEqual(vehicle.state.p, state.p, 'motion sync preserves vehicle position');
console.log(
  JSON.stringify({
    players: room.pilots.size,
    baseline,
    updatesPerSample: 1000,
    samples: 11,
    baselineMsPerUpdate: +baselineMs.toFixed(5),
    currentMsPerUpdate: +currentMs.toFixed(5),
    speedup: +(baselineMs / currentMs).toFixed(2),
    scope: 'CPU game.sync on valid pilot flight motion without vacant reports; not network or GPU',
  }),
);
