import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { segmentSphere } from '../src/ordnance.js';
import { sweptSphereMayTouch } from '../src/swept-broadphase.js';

// CPU-only, same 50 vehicle segments × 900 enemy centers. One iteration is
// a collision scan (not a full game frame, network workload or GPU rendering).
let seed = 167;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const enemies = Array.from({ length: 900 }, () => ({
  position: Array.from({ length: 3 }, () => (rand() - 0.5) * 4),
  radius: 0.002 + rand() * 0.018,
}));
const vehicles = Array.from({ length: 50 }, (_, id) => {
  const start = Array.from({ length: 3 }, () => (rand() - 0.5) * 4);
  return { id, start, end: start.map((v) => v + (rand() - 0.5) * 0.1) };
});
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
function scan(optimized) {
  let hits = 0;
  for (const v of vehicles)
    for (const e of enemies) {
      if (optimized && !sweptSphereMayTouch(v.start, v.end, e.position, e.radius)) continue;
      if (segmentSphere(v.start, v.end, e.position, e.radius) !== null) hits++;
    }
  return hits;
}
assert.equal(scan(false), scan(true), 'optimized query must preserve exact hit count');
for (let i = 0; i < 4; i++) {
  scan(false);
  scan(true);
}
const direct = [],
  indexed = [];
for (let i = 0; i < 12; i++) {
  for (const [optimized, times] of i % 2 ? [[true, indexed], [false, direct]] : [[false, direct], [true, indexed]]) {
    const start = performance.now();
    const hits = scan(optimized);
    times.push(performance.now() - start);
    assert.equal(hits, scan(!optimized), 'all hits must be identical');
  }
}
console.log(
  JSON.stringify({
    players: vehicles.length,
    enemies: enemies.length,
    checks: vehicles.length * enemies.length,
    directMs: +median(direct).toFixed(3),
    broadPhaseMs: +median(indexed).toFixed(3),
    hits: scan(false),
    note: 'CPU-only narrow-phase benchmark; not 50 real connected players',
  }),
);
