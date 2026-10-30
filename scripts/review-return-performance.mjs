import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { nearestInsectHit } from '../src/insect-hits.js';
import { TracerPool } from '../src/tracers.js';
import { enemyRoute } from '../src/routes.js';
const baseline = '94c54a4cd98f4956a0bc9c48a8a630cd5fbc5936';
function oldURL(file, overrides = {}) {
  let source = execFileSync('git', ['show', baseline + ':src/' + file + '.js'], {
    encoding: 'utf8',
  });
  source = source.replace(
    /from '(\.\/[^']+)'/g,
    (_, name) =>
      'from ' +
      JSON.stringify(
        overrides[name] || pathToFileURL(process.cwd() + '/src/' + name.slice(2)).href,
      ),
  );
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}
const oldHits = await import(oldURL('insect-hits')),
  oldTracers = await import(oldURL('tracers'));
const scene = new T.Scene(),
  graphics = createGraphics(T, scene),
  insects = new Map();
for (let i = 0; i < 180; i++) {
  const g = graphics.insect('midge');
  g.position.set((i % 18) * 0.04 - 0.36, 0.2 + Math.floor(i / 18) * 0.04, -0.5);
  g.scale.setScalar(0.003);
  insects.set(i, g);
}
const origin = new T.Vector3(1, 1, 1),
  direction = new T.Vector3(0, 0, -1);
function median(fn) {
  const times = [];
  for (let run = 0; run < 3; run++) {
    const at = performance.now();
    fn();
    times.push(performance.now() - at);
  }
  return times.sort((a, b) => a - b)[1];
}
const perf = [];
for (const clients of [1, 3]) {
  const rays = 3000 * clients;
  const before = median(() => {
    for (let i = 0; i < rays; i++) oldHits.nearestInsectHit(T, origin, direction, insects, 0.02);
  });
  const after = median(() => {
    for (let i = 0; i < rays; i++) nearestInsectHit(T, origin, direction, insects, 0.02);
  });
  perf.push({
    clients,
    rays,
    targets: 180,
    beforeMs: before,
    afterMs: after,
    speedup: before / after,
  });
}
const pool = new TracerPool(T, scene, 256);
const beforeTracerMs = median(() => {
  for (let i = 0; i < 1000; i++) {
    const m = oldTracers.makeTracer(T, scene, origin, direction, '#abc');
    scene.remove(m);
    m.userData.dispose();
  }
});
const afterTracerMs = median(() => {
  for (let i = 0; i < 1000; i++) {
    const m = pool.acquire(origin, direction, '#abc');
    m.userData.dispose();
  }
});
const allocated = pool.all.size;
pool.dispose();
const oldRoutesURL = oldURL('routes'),
  oldRoutes = await import(oldRoutesURL),
  oldWaves = await import(oldURL('waves', { './routes.js': oldRoutesURL }));
const routes = [];
let airPair, groundPair;
for (const room of ['ROOM0', 'ROOM1', 'ROOM2'])
  for (const wave of [1, 4, 8])
    for (const enemy of oldWaves.wavePlan(room, wave, 1000).roster.slice(0, 12)) {
      const old = oldRoutes.enemyRoute(enemy),
        now = enemyRoute(enemy);
      const extent = (r) => ({
        x: Math.max(...r.samples.map((s) => s.p[0])) - Math.min(...r.samples.map((s) => s.p[0])),
        z: Math.max(...r.samples.map((s) => s.p[2])) - Math.min(...r.samples.map((s) => s.p[2])),
      });
      routes.push({
        room,
        wave,
        type: enemy.type,
        beforeLength: old.length,
        afterLength: now.length,
        beforeSeconds: enemy.duration,
        afterSeconds: 2 + now.length / enemy.travelSpeed,
        beforeExtent: extent(old),
        afterExtent: extent(now),
        speed: enemy.travelSpeed,
      });
      if (!enemy.ground && !airPair) airPair = [old, now];
      if (enemy.ground && !groundPair) groundPair = [old, now];
    }
const result = {
  baseline,
  method:
    'CPU median of 3 runs. Controlled misses on 180 actual insect models. clients repeats ray work, not simultaneous browsers or WAN. Tracer allocations are replayed creation/release, not GPU rendering.',
  rays: perf,
  tracers: {
    count: 1000,
    beforeMs: beforeTracerMs,
    afterMs: afterTracerMs,
    allocatedMeshes: allocated,
  },
  routes,
};
writeFileSync('docs/return-performance.json', JSON.stringify(result, null, 2) + '\n');
function panel(route, x, y, label) {
  const points = route.samples
    .map((s) => x + 20 + (s.p[0] + 4.2) * 48 + ',' + (y + 45 + (s.p[2] + 3.55) * 43))
    .join(' ');
  return `<rect x="${x}" y="${y}" width="450" height="375" rx="9" fill="#e1e7d6"/><text x="${x + 16}" y="${y + 25}" font-size="16">${label} · ${route.length.toFixed(1)} m</text><polyline points="${points}" fill="none" stroke="#326d63" stroke-width="2"/>`;
}
writeFileSync(
  'docs/routes-return.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="850"><rect width="960" height="850" fill="#193b32"/><g font-family="sans-serif"><text x="20" y="30" font-size="21" fill="#f0eed4">VAG-04 · Même graine et vitesse · Vue de dessus</text>${panel(airPair[0], 20, 50, 'Vol avant')}${panel(airPair[1], 490, 50, 'Vol après')}${panel(groundPair[0], 20, 450, 'Sol avant')}${panel(groundPair[1], 490, 450, 'Sol après')}</g></svg>`,
);
console.log(JSON.stringify({ rays: perf, tracers: result.tracers, routes: routes.length }));
