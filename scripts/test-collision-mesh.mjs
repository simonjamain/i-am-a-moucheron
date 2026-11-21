// Triangle collision meshes (collision-mesh.ts) and the props' triangle colliders
// (office-collision.ts): exact against brute force, model frames, approximated
// and ignored models, the photocopier's paper slot left open. See docs/collisions.md.
import assert from 'node:assert/strict';
import { TriangleMesh, boxTriangles } from '../src/collision-mesh.ts';
import {
  propMeshSolids,
  modelMesh,
  raycastSolid,
  nearestOnSolid,
  solidTriangles,
  collisionShape,
} from '../src/office-collision.ts';
import { MODEL_DATA } from '../src/office-pack-data.js';
import { OFFICE_MODELS } from '../src/office-pack-catalog.ts';
import { LAYOUTS } from '../src/layouts.ts';
import { ROD } from '../src/office-props.ts';

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const unit = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
// Brute force: every triangle of every solid, in world coordinates.
function bruteRay(world, o, d) {
  let best = Infinity;
  for (const t of world)
    for (let p = 0; p < t.length; p += 9) {
      const e1 = [t[p + 3] - t[p], t[p + 4] - t[p + 1], t[p + 5] - t[p + 2]];
      const e2 = [t[p + 6] - t[p], t[p + 7] - t[p + 1], t[p + 8] - t[p + 2]];
      const P = [
        d[1] * e2[2] - d[2] * e2[1],
        d[2] * e2[0] - d[0] * e2[2],
        d[0] * e2[1] - d[1] * e2[0],
      ];
      const det = e1[0] * P[0] + e1[1] * P[1] + e1[2] * P[2];
      if (Math.abs(det) < 1e-12) continue;
      const s = [o[0] - t[p], o[1] - t[p + 1], o[2] - t[p + 2]];
      const u = (s[0] * P[0] + s[1] * P[1] + s[2] * P[2]) / det;
      if (u < 0 || u > 1) continue;
      const Q = [
        s[1] * e1[2] - s[2] * e1[1],
        s[2] * e1[0] - s[0] * e1[2],
        s[0] * e1[1] - s[1] * e1[0],
      ];
      const v = (d[0] * Q[0] + d[1] * Q[1] + d[2] * Q[2]) / det;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2[0] * Q[0] + e2[1] * Q[1] + e2[2] * Q[2]) / det;
      if (tt >= 0 && tt < best) best = tt;
    }
  return best;
}

// A unit box: rays, normals facing the ray, nearest points, an empty mesh.
const cube = new TriangleMesh(new Float32Array(boxTriangles([0, 0, 0, 1, 1, 1])));
assert.equal(cube.count, 12);
const down = cube.raycast(0.5, 3, 0.5, 0, -1, 0);
assert.ok(Math.abs(down.distance - 2) < 1e-9);
assert.deepEqual(down.normal.map(Math.round), [0, 1, 0], 'top face, facing the ray');
assert.equal(cube.raycast(0.5, 3, 0.5, 0, 1, 0), null, 'pointing away');
assert.equal(cube.raycast(0.5, 3, 0.5, 0, -1, 0, 1.5), null, 'beyond far');
const near = cube.nearest(2, 0.5, 0.5);
assert.ok(Math.abs(near.distance - 1) < 1e-9 && Math.abs(near.point[0] - 1) < 1e-9);
assert.equal(cube.nearest(2, 0.5, 0.5, 0.5), null, 'outside the radius');
assert.equal(new TriangleMesh(new Float32Array(0)).raycast(0, 0, 0, 1, 0, 0), null);

// Diagonale: one solid per colliding prop; the walls stay boxes (shell solids).
const diagonale = LAYOUTS.find((l) => l.id === 'diagonale');
const solids = propMeshSolids(MODEL_DATA, diagonale.props);
assert.ok(solids.length > 60);
const ghosts = new Set(diagonale.props.filter((p) => p.ghost).map((p) => p.model));
assert.ok(ghosts.has('Wall') && ghosts.has('Wall_Corner'));
assert.ok(solids.every((s) => !ghosts.has(s.model) && collisionShape(s.model) !== 'none'));
assert.ok(
  solids.some((s) => s.model === 'Wall_Clock'),
  'wall items have relief',
);
for (const s of solids) assert.equal(s.mesh, modelMesh(MODEL_DATA, s.model), 'one mesh per model');
// Real triangles, except the approximated piles of paper.
assert.equal(modelMesh(MODEL_DATA, 'Desk').count, OFFICE_MODELS.Desk.triangles);
assert.equal(modelMesh(MODEL_DATA, 'Keyboard').count, OFFICE_MODELS.Keyboard.triangles);
assert.equal(collisionShape('Paper_Stack_Tall'), 'proxy');
assert.equal(modelMesh(MODEL_DATA, 'Paper_Stack_Tall').count, 12, 'one box');
assert.equal(collisionShape('Wall_Vent'), 'none');
assert.equal(
  modelMesh(MODEL_DATA, 'Ceiling_Fan').count,
  OFFICE_MODELS.Ceiling_Fan.triangles + 12,
  'fan and its rod',
);
assert.ok(Math.abs(modelMesh(MODEL_DATA, 'Ceiling_Fan').max[1] - ROD) < 1e-6);

// Exact: the same nearest hit as testing every triangle, rays in every direction.
const world = solids.map(solidTriangles);
let hits = 0;
for (let i = 0; i < 160; i++) {
  const o = [random() * 8 - 4, random() * 2.4, random() * 7 - 3.5];
  const d = unit([random() - 0.5, random() - 0.6, random() - 0.5]);
  let best = Infinity;
  for (const s of solids) {
    const h = raycastSolid(s, o, d);
    if (h) best = Math.min(best, h.distance);
  }
  const expected = bruteRay(world, o, d);
  if (expected < Infinity) hits++;
  assert.ok(
    expected === best || Math.abs(expected - best) < 1e-4,
    `ray ${i}: ${best} vs ${expected}`,
  );
}
assert.ok(hits > 20, 'the rays do hit furniture');
// Nearest point: on the mesh, never farther than its nearest vertex.
for (let i = 0; i < 30; i++) {
  const p = [random() * 8 - 4, random() * 2.4, random() * 7 - 3.5];
  let best = null;
  for (const s of solids) {
    const n = nearestOnSolid(s, p);
    if (n && (!best || n.distance < best.distance)) best = n;
  }
  let vertex = Infinity;
  for (const t of world)
    for (let q = 0; q < t.length; q += 3)
      vertex = Math.min(vertex, Math.hypot(t[q] - p[0], t[q + 1] - p[1], t[q + 2] - p[2]));
  assert.ok(best.distance <= vertex + 1e-6);
  assert.ok(Math.abs(Math.hypot(...best.point.map((v, k) => v - p[k])) - best.distance) < 1e-6);
}

// Turned props: a world ray down onto a turned chair's seat hits its real top.
const chair = solids.find((s) => s.model.startsWith('Office_Chair') && Math.abs(s.frame.s) > 0.1);
const seat = raycastSolid(chair, [chair.frame.x, 2, chair.frame.z], [0, -1, 0]);
assert.ok(seat && seat.normal[1] > 0.9, 'seat from above');
assert.ok(2 - seat.distance < OFFICE_MODELS[chair.model].max[1], 'below the backrest top');

// The photocopier's paper slot stays open: a ray enters it 30 cm deep.
const copier = solids.find((s) => s.model === 'Photocopier');
const front = OFFICE_MODELS.Photocopier.max[0] + 0.1;
const local = (u, v) => [
  copier.frame.x + copier.frame.c * u + copier.frame.s * v,
  copier.frame.z - copier.frame.s * u + copier.frame.c * v,
];
const [sx, sz] = local(front, 0.1);
const inward = [-copier.frame.c, 0, copier.frame.s];
const slot = raycastSolid(copier, [sx, 0.7, sz], inward);
assert.ok(!slot || slot.distance - 0.1 > 0.3, 'paper slot open');
const body = raycastSolid(copier, [sx, 0.8, sz], inward);
assert.ok(body && body.distance - 0.1 < 0.1, 'body above the slot');

console.log(
  `Collision meshes: ${solids.length} props, BVH rays and nearest points exact, turned frames, paper proxies, copier slot open.`,
);
