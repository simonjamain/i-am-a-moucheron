import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { InsectIndex, nearestInsectHit } from '../src/insect-hits.js';
// CPU-only: each sample includes one index rebuild and 256 swept shot segments.
// Models/queries and narrow phase are identical; no GPU or network is measured.
let seed = 42;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
for (const count of [100, 300, 900, 3000]) {
  for (const spread of [2, 0.12]) {
    const scene = new T.Scene(),
      graphics = createGraphics(T, scene),
      insects = new Map();
    for (let i = 0; i < count; i++) {
      const model = graphics.insect();
      model.scale.setScalar(0.01);
      model.position.set((random() - 0.5) * spread, random() * spread, (random() - 0.5) * spread);
      insects.set(i, model);
    }
    const index = new InsectIndex(T, insects);
    const shots = Array.from({ length: 256 }, () => {
      const target = insects.get(Math.floor(random() * count)).position;
      const direction = new T.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      return { origin: target.clone().addScaledVector(direction, -0.03), direction };
    });
    const run = (indexed) => {
      const start = performance.now();
      index.invalidate();
      for (const s of shots)
        nearestInsectHit(T, s.origin, s.direction, insects, 0.02, null, indexed ? index : null);
      return performance.now() - start;
    };
    for (let warmup = 0; warmup < 4; warmup++) {
      run(false);
      run(true);
    }
    const before = [],
      after = [];
    for (let sample = 0; sample < 12; sample++) {
      if (sample % 2) {
        after.push(run(true));
        before.push(run(false));
      } else {
        before.push(run(false));
        after.push(run(true));
      }
    }
    const candidates =
      shots.reduce((n, s) => n + [...index.query(s.origin, s.direction, 0.02)].length, 0) /
      shots.length;
    console.log(
      JSON.stringify({
        count,
        layout: spread === 2 ? 'spread' : 'dense',
        shots: shots.length,
        exhaustiveMs: +median(before).toFixed(3),
        indexedMs: +median(after).toFixed(3),
        averageCandidates: +candidates.toFixed(1),
        includesRebuild: true,
      }),
    );
    for (const model of insects.values()) model.traverse((m) => m.geometry?.dispose());
  }
}
