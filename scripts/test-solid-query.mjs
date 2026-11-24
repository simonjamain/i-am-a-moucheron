// Ray queries on the game's box solids (src/solid-query.ts, Rapier): same hits as the
// per-box ray tests they replace (rayCollider / colliderNormal), for plain and turned boxes.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { loadRapier, toWorld } from '../src/physics-world.ts';
import { SolidQuery } from '../src/solid-query.ts';
import { colliderNormal, orientedBox, rayCollider } from '../src/oriented-collider.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const box = (x0, y0, z0, x1, y1, z1) =>
  new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1));
const rotated = orientedBox(T, box(-30, 0, -22, 30, toWorld(3), -18), {
  x: 0,
  z: toWorld(-20),
  c: Math.cos(0.5),
  s: Math.sin(0.5),
  bounds: box(toWorld(-12), 0, toWorld(-1.5), toWorld(20), toWorld(3), toWorld(1.5)),
});
const plain = box(toWorld(5), 0, toWorld(-8), toWorld(9), toWorld(3), toWorld(-3));
const solids = [rotated, plain];
const query = new SolidQuery(RAPIER);
query.sync(solids);

// Brute force over the boxes, as the client did.
const reference = (origin, direction, far) => {
  const ray = new T.Ray(origin, direction);
  let best = Infinity,
    bestBox = null,
    point = null;
  for (const candidate of solids) {
    const p = rayCollider(T, ray, candidate, new T.Vector3());
    if (!p) continue;
    const d = origin.distanceTo(p);
    if (d < best) [best, bestBox, point] = [d, candidate, p.clone()];
  }
  return best <= far ? { distance: best, normal: colliderNormal(bestBox, point.toArray()) } : null;
};

let hits = 0,
  seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
for (let n = 0; n < 600; n++) {
  const origin = new T.Vector3(
    toWorld((random() - 0.5) * 60),
    toWorld(0.5 + random() * 2),
    toWorld((random() - 0.5) * 60),
  );
  // Slightly slanted rays; starts inside a box are left out (the exit rule is tested below).
  const angle = random() * Math.PI * 2,
    dir = new T.Vector3(Math.cos(angle), (random() - 0.5) * 0.3, Math.sin(angle)).normalize();
  if (solids.some((s) => s.containsPoint(origin))) continue;
  const far = toWorld(40),
    expected = reference(origin, dir, far),
    got = query.hit(origin.toArray(), dir.toArray(), far);
  assert.equal(!!got, !!expected, `same hit or miss (${n})`);
  if (!got) continue;
  hits++;
  assert.ok(Math.abs(got.distance - expected.distance) < toWorld(1e-3), `distance ${n}`);
  // Rapier returns the normal facing the ray; the box rule the outward one: the same for an entry.
  assert.ok(
    got.normal.every((v, k) => Math.abs(v - expected.normal[k]) < 1e-3),
    `normal ${n}: ${got.normal} vs ${expected.normal}`,
  );
}
assert.ok(hits > 50, `rays that hit: ${hits}`);

// `far` bounds the query, and the physics floor slab is not a solid of the game.
const o = [toWorld(7), toWorld(1), toWorld(-20)];
assert.equal(query.distance(o, [0, 0, 1], toWorld(1)), Infinity, 'out of reach');
assert.equal(query.distance([0, toWorld(1), 0], [0, -1, 0], toWorld(10)), Infinity, 'no slab');
// A moved box is seen after the next sync; a removed one is gone.
plain.translate(new T.Vector3(toWorld(10), 0, 0));
query.sync(solids);
const [ax, ay, az] = [toWorld(18), toWorld(1), toWorld(-5)];
assert.ok(query.distance([ax, ay, az], [0, 0, 1], toWorld(10)) < Infinity, 'moved box');
solids.pop();
query.sync(solids);
assert.equal(query.distance([ax, ay, az], [0, 0, 1], toWorld(10)), Infinity, 'removed box');
// Segments and nearest distances use the same solids.
query.sync(solids);
const wall = query.segment([0, ay, toWorld(-30)], [0, ay, toWorld(30)]);
const wallRay = query.hit([0, ay, toWorld(-30)], [0, 0, 1], toWorld(60));
assert.ok(wall && wallRay, 'a segment across the room meets a solid');
assert.ok(
  Math.abs(wall.t * toWorld(60) - wallRay.distance) < 1e-6,
  'segment fraction = ray distance',
);
assert.equal(query.segment([0, ay, toWorld(-30)], [0, ay, toWorld(-30)]), null, 'empty segment');
const where = [0, ay, toWorld(-30) + wallRay.distance];
assert.ok(
  query.nearest([where[0], where[1], where[2] - toWorld(0.5)], toWorld(1)) <= toWorld(0.5) + 1e-4,
  'nearest distance',
);
assert.equal(query.nearest([0, toWorld(500), 0], toWorld(1)), null, 'nothing within the radius');
// The props' triangles come from the decor world, and their boxes then drop out.
solids.forEach((box) => (box.decor = true));
const prop = {
  raycast: () => ({ distance: 3, normal: [0, 1, 0] }),
  nearest: () => ({ distance: 2 }),
};
query.sync(solids, prop);
assert.equal(
  query.hit([0, ay, toWorld(-30)], [0, 0, 1], toWorld(50)).distance,
  3,
  'decor triangles',
);
assert.equal(query.nearest([0, ay, 0], 5), 2, 'decor nearest');
query.sync(solids, { raycast: () => null, nearest: () => null });
assert.equal(query.hit([0, ay, toWorld(-30)], [0, 0, 1], toWorld(50)), null, 'skipped boxes');
query.dispose();

console.log(
  `Solid queries: ${hits} ray hits match the box tests; moved, removed and skipped solids.`,
);
