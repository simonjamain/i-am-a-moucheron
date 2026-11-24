// The props' triangle colliders in a Rapier world of the decor (office-collision.ts):
// rays and nearest points exact against brute force, turned props, approximated
// and ignored models, the photocopier's paper slot left open. See docs/collisions.md.
import assert from 'node:assert/strict';
import {
  DecorCollision,
  modelTriangles,
  solidTriangles,
  collisionShape,
  boxTriangles,
} from '../src/office-collision.ts';
import { loadRapier } from '../src/physics-world.ts';
import { MODEL_DATA } from '../src/office-pack-data.ts';
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

// Diagonale: one Rapier collider per colliding prop; the walls stay boxes (shell solids).
const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const diagonale = LAYOUTS.find((l) => l.id === 'diagonale');
let started = performance.now();
const decor = new DecorCollision(RAPIER, MODEL_DATA, diagonale.props);
const buildMs = performance.now() - started;
const solids = decor.solids;
assert.ok(solids.length > 60);
const ghosts = new Set(diagonale.props.filter((p) => p.ghost).map((p) => p.model));
assert.ok(ghosts.has('Wall') && ghosts.has('Wall_Corner'));
assert.ok(solids.every((s) => !ghosts.has(s.model) && collisionShape(s.model) !== 'none'));
assert.ok(
  solids.some((s) => s.model === 'Wall_Clock'),
  'wall items have relief',
);
// Real triangles, except the approximated piles of paper.
const count = (model) => modelTriangles(MODEL_DATA, model).length / 9;
assert.equal(count('Desk'), OFFICE_MODELS.Desk.triangles);
assert.equal(count('Keyboard'), OFFICE_MODELS.Keyboard.triangles);
assert.equal(collisionShape('Paper_Stack_Tall'), 'proxy');
assert.equal(count('Paper_Stack_Tall'), 12, 'one box');
assert.equal(collisionShape('Wall_Vent'), 'none');
assert.equal(count('Ceiling_Fan'), OFFICE_MODELS.Ceiling_Fan.triangles + 12, 'fan and its rod');
const fan = modelTriangles(MODEL_DATA, 'Ceiling_Fan');
assert.ok(Math.abs(Math.max(...fan.filter((_, i) => i % 3 === 1)) - ROD) < 1e-6);
assert.equal(boxTriangles([0, 0, 0, 1, 1, 1]).length, 12 * 9);

// Exact: the same nearest hit as testing every triangle, rays in every direction.
const world = solids.map((s) => solidTriangles(MODEL_DATA, s));
let hits = 0;
started = performance.now();
const rays = [];
for (let i = 0; i < 160; i++) {
  const o = [random() * 8 - 4, random() * 2.4, random() * 7 - 3.5];
  const d = unit([random() - 0.5, random() - 0.6, random() - 0.5]);
  rays.push([o, d, decor.raycast(o, d)]);
}
const rayUs = ((performance.now() - started) / rays.length) * 1000;
for (const [o, d, hit] of rays) {
  const expected = bruteRay(world, o, d);
  if (expected < Infinity) hits++;
  const best = hit ? hit.distance : Infinity;
  assert.ok(expected === best || Math.abs(expected - best) < 2e-4, `ray: ${best} vs ${expected}`);
  if (hit) {
    assert.ok(hit.normal[0] * d[0] + hit.normal[1] * d[1] + hit.normal[2] * d[2] <= 0);
    assert.ok(Math.abs(hit.point[1] - (o[1] + d[1] * hit.distance)) < 1e-9);
  }
}
assert.ok(hits > 20, 'the rays do hit furniture');
// Nearest point: on a surface, never farther than its nearest vertex.
for (let i = 0; i < 30; i++) {
  const p = [random() * 8 - 4, random() * 2.4, random() * 7 - 3.5];
  const best = decor.nearest(p);
  let vertex = Infinity;
  for (const t of world)
    for (let q = 0; q < t.length; q += 3)
      vertex = Math.min(vertex, Math.hypot(t[q] - p[0], t[q + 1] - p[1], t[q + 2] - p[2]));
  assert.ok(best.distance <= vertex + 1e-4, `nearest ${best.distance} vs vertex ${vertex}`);
}
assert.equal(decor.nearest([0, 3.9, 0], 0.01), null, 'nothing near the flight ceiling');

// Turned props: a ray down onto a turned chair's seat hits its real top.
const chair = solids.find((s) => s.model.startsWith('Office_Chair') && Math.abs(s.frame.s) > 0.1);
const seat = decor.raycast([chair.frame.x, 2, chair.frame.z], [0, -1, 0], 3, chair);
assert.ok(seat && seat.normal[1] > 0.9, 'seat from above');
assert.ok(seat.point[1] < OFFICE_MODELS[chair.model].max[1], 'below the backrest top');

// The photocopier's paper slot stays open: a ray enters it 30 cm deep.
const copier = solids.find((s) => s.model === 'Photocopier');
const front = OFFICE_MODELS.Photocopier.max[0] + 0.1;
const sx = copier.frame.x + copier.frame.c * front + copier.frame.s * 0.1,
  sz = copier.frame.z - copier.frame.s * front + copier.frame.c * 0.1;
const inward = [-copier.frame.c, 0, copier.frame.s];
const slot = decor.raycast([sx, 0.7, sz], inward, 3, copier);
assert.ok(!slot || slot.distance - 0.1 > 0.3, 'paper slot open');
const body = decor.raycast([sx, 0.8, sz], inward, 3, copier);
assert.ok(body && body.distance - 0.1 < 0.1, 'body above the slot');
// Placement on the real surfaces (equipment.ts with the decor as support), and
// the server accepting the height the client found (decorTrust).
const { supportedPlacement, decorTrust } = await import('../src/equipment.ts');
const { layoutSolids } = await import('../src/layouts.ts');
const boxes = layoutSolids(diagonale);
assert.ok(boxes.some((b) => b.decor) && boxes.some((b) => !b.decor), 'prop boxes marked');
const place = (x, y, z) => supportedPlacement({ x, y, z, angle: 0 }, boxes, [], 'dca', decor);
const server = (x, builderY, z, claimed) =>
  supportedPlacement(
    { x, y: builderY, z, angle: 0 },
    boxes,
    [],
    'dca',
    decorTrust(boxes, claimed - 0.00005),
  );
for (const p of diagonale.props.filter((q) => /Chair|Photocopier/.test(q.model))) {
  const top = decor.raycast([p.x, 2.5, p.z], [0, -1, 0], 3);
  const at = place(p.x, top.point[1], p.z);
  assert.ok(at && Math.abs(at.y - 0.00005 - top.point[1]) < 1e-4, p.model + ' top supports');
  assert.ok(Math.abs(server(p.x, at.y, p.z, at.y).y - at.y) <= 0.0003, 'server agrees');
}
const seatTop = place(chair.frame.x, seat.point[1], chair.frame.z).y;
assert.ok(seatTop < 0.5, 'on the seat, not on the box around the backrest');
const desk = diagonale.props.find((p) => p.model === 'Desk');
assert.ok(Math.abs(place(desk.x, 0.745, desk.z + 0.3).y - 0.74005) < 1e-4, 'desk top');
assert.equal(place(desk.x + 0.85, 0.745, desk.z), null, 'nothing beyond the desk edge');
const keyboard = diagonale.props.find((p) => p.model === 'Keyboard');
assert.equal(place(keyboard.x, 0.777, keyboard.z), null, 'uneven keys: no support');
// Vehicles are less picky: the blades of a fan (uneven, tilted) carry a fighter, which
// rests on the highest contact under its hull. Equipment keeps the strict rules.
const rugged = (model, kind) => {
  let accepted = 0;
  for (const fan of diagonale.props.filter((p) => p.model === model))
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 12; j++) {
        const x = fan.x + (i - 6) * 0.06,
          z = fan.z + (j - 6) * 0.06;
        const top = decor.raycast([x, 2.5, z], [0, -1, 0], 3);
        if (!top || top.point[1] < 0.05) continue;
        const at = supportedPlacement({ x, y: top.point[1], z, angle: 0 }, boxes, [], kind, decor);
        if (!at) continue;
        accepted++;
        assert.ok(Math.abs(at.y - 0.00005 - top.point[1]) <= 0.02, model + ': on its contact');
      }
  return accepted;
};
assert.ok(rugged('Ceiling_Fan', 'fighter') > 20, 'a fighter can be placed on the fan blades');
assert.ok(
  rugged('Ceiling_Fan', 'dca') < rugged('Ceiling_Fan', 'fighter'),
  'equipment stays stricter',
);
assert.equal(placeVehicleEdge(), null, 'still nothing beyond the desk');
function placeVehicleEdge() {
  return supportedPlacement(
    { x: desk.x + 0.85, y: 0.745, z: desk.z, angle: 0 },
    boxes,
    [],
    'fighter',
    decor,
  );
}
// The server trusts heights inside a prop's box only.
assert.equal(server(desk.x, 0.745, desk.z + 0.3, 1.5), null, 'claimed height above the desk');
assert.ok(server(0.6, 0, -0.4, 0), 'open floor stays a box rule');
// Headroom: the decor blocks a placement whose volume crosses a triangle.
const hanging = solids.find((s) => s.model === 'Ceiling_Fan');
const q = {
  x: hanging.frame.x,
  z: hanging.frame.z,
  y: 0,
  angle: 0,
  rx: 0.05,
  rz: 0.05,
  height: 2.1,
};
assert.equal(decor.clear(q, 0), false, 'the fan hangs in a 2.1 m headroom');
assert.equal(decor.clear({ ...q, height: 1.5 }, 0), true, 'below the fan');
decor.dispose();

// The client's rays (solidRayDistance, src/client.js): the pack props' boxes give
// way to their triangles once the decor world is built; shell and floor stay boxes.
const T = await import('../vendor/three.webgpu.min.js');
const { createOffice } = await import('../src/office.ts');
const { createGraphics } = await import('../src/graphics.js');
const { setActiveLayout } = await import('../src/layouts.ts');
setActiveLayout('diagonale');
const scene = new T.Scene();
const office = createOffice(T, scene, createGraphics(T, scene));
const { SolidQuery } = await import('../src/solid-query.ts');
// What the client does (solidRayHit): the boxes in a Rapier world, minus the pack props'
// boxes once the decor world exists, then the decor's triangles.
const query = new SolidQuery(RAPIER);
const solidRayDistance = (ray, far) => {
  query.sync(office.colliders, office.decor ? (box) => box.decor : undefined);
  const o = ray.origin.toArray(),
    d = ray.direction.toArray();
  let best = query.distance(o, d, far);
  if (office.decor) {
    const hit = office.decor.raycast(o, d, Math.min(far, best));
    if (hit && hit.distance < best) best = hit.distance;
  }
  return best <= far ? best : Infinity;
};
assert.ok(office.colliders.some((b) => b.decor) && office.colliders.some((b) => !b.decor));
const ray = (o, d) => new T.Ray(new T.Vector3(...o), new T.Vector3(...d).normalize());
const cast = (o, d, far = 10) => solidRayDistance(ray(o, d), far);
// Through the copier's paper slot: the box stopped it, the triangles do not.
const slotOrigin = [sx, 0.7, sz];
const before = cast(slotOrigin, inward);
assert.equal(office.buildDecor(RAPIER), office.decor);
const after = cast(slotOrigin, inward);
assert.ok(before < 0.15 && after > 0.4, `copier slot: ${before} -> ${after}`);
// Down onto a turned chair's seat, past the box around its backrest.
const seatRay = [chair.frame.x, 2, chair.frame.z];
assert.ok(Math.abs(2 - cast(seatRay, [0, -1, 0]) - seat.point[1]) < 1e-6, 'chair seat');
// Shell walls and the floor are still boxes.
// Rapier works in 32-bit floats: a few micrometres of the office are plenty.
assert.ok(Math.abs(cast([0, 1, 0], [0, -1, 0]) - 1) < 1e-5, 'floor');
assert.ok(Math.abs(cast([2.5, 2.0, 0], [0, 0, -1]) - 3.6) < 1e-5, 'back wall face');
assert.equal(cast([0, 3.5, 0], [0, 1, 0]), Infinity, 'nothing above the clouds');
office.dispose();
assert.equal(office.decor, null, 'decor world freed with the plan');

console.log(
  `Collision meshes (Rapier): ${solids.length} props, ${decor.triangleCount} triangles, built in ${buildMs.toFixed(0)} ms, ray ${rayUs.toFixed(0)} µs; exact against brute force, turned props, paper proxies, copier slot open.`,
);
