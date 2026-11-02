import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { segmentSphere } from '../src/ordnance.js';
import { sweptSphereMayTouch } from '../src/swept-broadphase.js';

// CPU-only: same vehicle contact path, 50 segments by 900 enemies.
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
// Include a known contact as well as thousands of misses.
enemies[0].position = vehicles[0].start.slice();
enemies[0].radius = 0.03;
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
function scan(optimized) {
  let hits = 0;
  for (const v of vehicles)
    for (const e of enemies) {
      if (optimized && !sweptSphereMayTouch(v.start, v.end, e.position, e.radius)) continue;
      const touching = Math.hypot(...v.end.map((n, i) => n - e.position[i])) <= e.radius;
      const impact = touching || segmentSphere(v.start, v.end, e.position, e.radius) !== null;
      if (impact) hits++;
    }
  return hits;
}
assert.equal(scan(false), scan(true), 'exact hit counts must remain identical');
assert.ok(scan(false) > 0, 'benchmark must include at least one real contact');
for (let i = 0; i < 4; i++) {
  scan(false);
  scan(true);
}
const direct = [],
  indexed = [];
for (let i = 0; i < 12; i++) {
  for (const optimized of (i % 2 ? [true, false] : [false, true])) {
    const samples = optimized ? indexed : direct;
    const start = performance.now();
    const hits = scan(optimized);
    samples.push(performance.now() - start);
    assert.equal(hits, scan(!optimized));
  }
}
console.log(
  JSON.stringify({
    vehicles: vehicles.length,
    enemies: enemies.length,
    checks: vehicles.length * enemies.length,
    directMs: +median(direct).toFixed(3),
    broadPhaseMs: +median(indexed).toFixed(3),
    hits: scan(false),
    note: 'CPU-only vehicle/insect contact scan, not full game FPS',
  }),
);
