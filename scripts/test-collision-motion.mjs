// Moving bodies on the decor's real triangles (lot 3, docs/collisions.md): landing
// gear on a chair seat, crashes (touch and swept segment), the walker's support
// and pushes, and the vehicles' Rapier worlds using the decor instead of boxes.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { loadRapier, PhysicsWorld, toPhysics } from '../src/physics-world.ts';
import { DecorCollision, sweptHitsDecor } from '../src/office-collision.ts';
import { MODEL_DATA } from '../src/office-pack-data.js';
import { LAYOUTS, layoutSolids, setActiveLayout } from '../src/layouts.ts';
import { resolveLanding, stepWalker } from '../src/sortie.ts';
import { stepVacantAircraft } from '../src/vacant-flight.ts';
import { ACTOR_UNIT, MAP } from '../src/scale.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import { VEHICLES } from '../src/fleet.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
setActiveLayout('diagonale');
const layout = LAYOUTS.find((l) => l.id === 'diagonale');
const decor = new DecorCollision(RAPIER, MODEL_DATA, layout.props);
const boxes = layoutSolids(layout);
const find = (model) => decor.solids.find((s) => s.model === model);
const gear = VEHICLES.fighter.gear;
// The client's colliders: Box3, the pack props' boxes marked `decor`.
const solids = boxes.map((b) => {
  const box = new T.Box3(
    new T.Vector3(b.min.x, b.min.y, b.min.z),
    new T.Vector3(b.max.x, b.max.y, b.max.z),
  );
  if (b.decor) box.decor = true;
  return box;
});

// Landing gear: a gentle descent over a chair lands on its seat, not on the box
// around its backrest; with the boxes, the same descent never reaches the seat.
const chair = find('Office_Chair_Blue');
const seat = decor.supportBelow(chair.frame.x, 1.5, chair.frame.z, 1.5);
assert.ok(seat > 0.4 && seat < 0.5, 'seat height ' + seat);
const descend = (withDecor) => {
  const state = {
    position: new T.Vector3(chair.frame.x, seat + gear + 0.05 * ACTOR_UNIT, chair.frame.z),
    vel: new T.Vector3(0, -MAP.metres(1), 0),
    q: new T.Quaternion(),
    omega: new T.Vector3(),
    gear,
  };
  const previous = state.position.clone();
  state.position.y -= 0.1 * ACTOR_UNIT;
  return [
    resolveLanding(T, state, previous, boxes, 1 / 60, withDecor ? decor : null),
    state.position.y,
  ];
};
const [onSeat, y] = descend(true);
assert.ok(onSeat.landed, 'landed on the seat');
assert.ok(Math.abs(y - (seat + gear)) < 1e-6, `wheels on the seat ${y} ${seat + gear}`);
assert.equal(descend(false)[0].landed, false, 'the box kept the seat out of reach');

// Crashes: touching a triangle, or crossing one between two steps (a fan blade is
// 5 cm thick: a fast step jumps over it without the swept test).
const fan = find('Ceiling_Fan');
// A point on a blade: around the hub, 55 cm out, where a ray from above meets it.
let blade = null;
for (let a = 0; a < 2 * Math.PI && !blade; a += 0.05) {
  const x = fan.frame.x + 0.55 * Math.cos(a),
    z = fan.frame.z + 0.55 * Math.sin(a);
  const top = decor.raycast([x, fan.frame.y, z], [0, -1, 0], 0.4, fan);
  if (top && top.point[1] > fan.frame.y - 0.4) blade = [x, top.point[1] - 0.01, z];
}
assert.ok(blade, 'a blade found');
const above = [blade[0], blade[1] + 0.1, blade[2]],
  below = [blade[0], blade[1] - 0.1, blade[2]];
assert.equal(decor.touches(above, 0.3 * ACTOR_UNIT), false);
assert.equal(decor.touches(below, 0.3 * ACTOR_UNIT), false);
assert.equal(sweptHitsDecor(decor, above, below, 0.3 * ACTOR_UNIT), true, 'through a blade');
assert.equal(sweptHitsDecor(decor, above, above, 0.3 * ACTOR_UNIT), false);
// Into the photocopier's paper slot: free, its body is not.
const copier = find('Photocopier');
const out = [copier.frame.x - 0.6, 0.7, copier.frame.z + 0.05],
  inside = [copier.frame.x - 0.1, 0.7, copier.frame.z + 0.05];
assert.equal(sweptHitsDecor(decor, out, inside, 0.3 * ACTOR_UNIT), false, 'into the slot');
assert.equal(
  sweptHitsDecor(decor, [out[0], 0.8, out[2]], [inside[0], 0.8, inside[2]], 0.3 * ACTOR_UNIT),
  true,
  'into the body',
);
// A vacant aircraft gliding into a fan is destroyed by the decor.
const vacant = {
  p: [blade[0] - 0.05, blade[1], blade[2]],
  q: [0, -Math.SQRT1_2, 0, Math.SQRT1_2],
  v: [MAP.metres(60), 0, 0],
  w: [0, 0, 0],
  hp: 100,
  gas: 0,
};
for (let i = 0; i < 120 && vacant.hp > 0; i++)
  stepVacantAircraft(T, vacant, VEHICLES.fighter, solids, 1 / 60, decor);
assert.equal(vacant.hp, 0, 'vacant aircraft crashed into the fan');

// Walker: stands on the real top of a desk and is pushed off a bookshelf's side.
const origin = OFFICE_LAYOUT.base;
const walkerAt = (x, y, z) => ({
  x: (x - origin.originX) / ACTOR_UNIT,
  z: (origin.originZ - z) / ACTOR_UNIT,
  y,
  vx: 0,
  vy: 0,
  vz: 0,
  r: 0.35,
  grounded: true,
});
const desk = layout.props.find((p) => p.model === 'Desk');
const onDesk = walkerAt(desk.x, 0.74 + 0.05 * ACTOR_UNIT, desk.z + 0.2);
stepWalker(onDesk, 1 / 60, boxes, decor);
assert.ok(onDesk.grounded && Math.abs(onDesk.y - (0.74 + 0.05 * ACTOR_UNIT)) < 1e-4, 'on the desk');
const shelf = layout.props.find((p) => p.model === 'Bookshelf');
const front = decor.raycast([shelf.x, 0.9 * ACTOR_UNIT, shelf.z + 1], [0, 0, -1], 2);
const tight = walkerAt(front.point[0], 0, front.point[2] + 0.1 * ACTOR_UNIT);
tight.vz = -1;
stepWalker(tight, 1 / 60, boxes, decor);
const worldZ = origin.originZ - tight.z * ACTOR_UNIT;
assert.ok(worldZ - front.point[2] > 0.3 * ACTOR_UNIT, 'pushed out of the shelf');

// Vehicles: their Rapier world copies the decor's triangles and drops the boxes.
const physics = new PhysicsWorld(RAPIER);
let started = performance.now();
physics.useDecor(decor);
const copyMs = performance.now() - started;
assert.equal(physics.decorColliders.length, decor.solids.length);
physics.useDecor(decor);
assert.equal(physics.decorColliders.length, decor.solids.length, 'copied once');
physics.sync(solids);
assert.equal(physics.solids.size, solids.filter((b) => !b.decor).length, 'props boxes left out');
physics.step(1 / 60);
const ray = new RAPIER.Ray(
  { x: toPhysics(chair.frame.x), y: toPhysics(1.5), z: toPhysics(chair.frame.z) },
  { x: 0, y: -1, z: 0 },
);
const hit = physics.world.castRay(ray, toPhysics(2), false);
assert.ok(Math.abs(1.5 - hit.timeOfImpact * (1.5 / toPhysics(1.5)) - seat) < 1e-4, 'seat in world');
physics.useDecor(null);
assert.equal(physics.decorColliders.length, 0);
physics.dispose();
decor.dispose();
console.log(
  `Collision motion: landing on a seat, swept crashes (fan blade, copier slot), walker on a desk and off a shelf, vehicle worlds with the decor (copy ${copyMs.toFixed(0)} ms).`,
);
