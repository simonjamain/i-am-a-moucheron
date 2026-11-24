// Cost of the insects' hit volumes (src/insect-hitboxes.ts): moving N volumes onto their models
// each frame, and a shot's ray against all of them. CPU time on this machine only.
import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.webgpu.min.js';
import { loadRapier } from '../src/physics-world.ts';
import { InsectHitboxes } from '../src/insect-hitboxes.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const counts = process.argv.slice(2).map(Number).filter(Boolean);
for (const n of counts.length ? counts : [100, 900, 3000]) {
  const boxes = new InsectHitboxes(T, RAPIER);
  const insects = new Map();
  for (let id = 0; id < n; id++) {
    const g = new T.Group();
    // A third of them midges (a sphere), the rest capsules.
    g.userData = id % 3 ? { hitEllipsoid: [0.3, 0.3, 1] } : { sphereRadius: 1.2 * 0.3 };
    g.scale.setScalar(0.01);
    g.position.set(Math.random() * 8 - 4, Math.random() * 3, Math.random() * 6 - 3);
    insects.set(id, g);
  }
  boxes.sync(insects);
  const frames = 200;
  let at = performance.now();
  for (let f = 0; f < frames; f++) {
    for (const g of insects.values()) {
      g.position.x += (Math.random() - 0.5) * 0.002;
      g.position.z += (Math.random() - 0.5) * 0.002;
    }
    boxes.sync(insects);
  }
  const frame = (performance.now() - at) / frames;
  const origin = new T.Vector3(0, 1, 5),
    direction = new T.Vector3(0.05, 0, -1);
  at = performance.now();
  for (let i = 0; i < 20000; i++) boxes.nearest(origin, direction, 12);
  const ray = ((performance.now() - at) * 1000) / 20000;
  console.log(
    JSON.stringify({
      insects: n,
      syncMsPerFrame: Math.round(frame * 1000) / 1000,
      rayMicroseconds: Math.round(ray * 100) / 100,
    }),
  );
  boxes.dispose();
}
