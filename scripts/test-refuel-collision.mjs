import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { makeServiceStation, makeRefuelCollider } from '../src/station-model.js';
import { stepWalker } from '../src/sortie.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
for (const angle of [Math.PI / 4, -Math.PI / 4, Math.PI / 3]) {
  const station = makeServiceStation(T, 'refuel');
  station.scale.setScalar(MAP.ratio);
  station.rotation.y = angle;
  const collider = makeRefuelCollider(T, station);
  const corner = new T.Vector3(collider.max.x - 0.0005, 0.001, collider.max.z - 0.0005);
  const body = {
    x: (corner.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - corner.z) / ACTOR_UNIT,
    y: 0.05 * ACTOR_UNIT,
    vy: 0,
    vx: 0,
    vz: 0,
    r: 0.16,
    grounded: true,
    parachute: false,
  };
  const before = [body.x, body.z];
  stepWalker(body, 1 / 60, [collider]);
  assert.ok(
    Math.hypot(body.x - before[0], body.z - before[1]) < 1e-8,
    'empty corner of diagonal station must not push the walker',
  );
  assert.equal(
    collider.containsPoint(corner),
    false,
    'diagonal empty corner is outside the hitbox',
  );
}
console.log('Refuel collision follows rotation and leaves empty diagonal corners walkable');

const { segmentBox, sweptBoxProximity } = await import('../src/swept-geometry.js');
const { rayCollider, colliderContainsXZ } = await import('../src/oriented-collider.js');
const { stepTank } = await import('../src/tank.js');
const { VEHICLES } = await import('../src/fleet.js');
for (const angle of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, -Math.PI / 3]) {
  const station = makeServiceStation(T, 'refuel');
  station.scale.setScalar(MAP.ratio);
  station.position.set(0.7, 0.2, -0.4);
  station.rotation.y = angle;
  const box = makeRefuelCollider(T, station);
  const world = (x, y, z) => station.localToWorld(new T.Vector3(x, y, z));
  const centre = world(0, 1, 0),
    outside = world(0, 1, 4),
    through = world(0, 1, -4);
  assert.ok(box.containsPoint(centre), 'centre inside at any heading');
  assert.equal(box.containsPoint(outside), false);
  const t = segmentBox(outside.toArray(), through.toArray(), box);
  assert.ok(t > 0 && t < 0.5, 'ray hits true rotated side');
  const missA = world(6.3, 1, 4),
    missB = world(6.3, 1, -4);
  assert.equal(
    segmentBox(missA.toArray(), missB.toArray(), box),
    null,
    'side gap stays empty after rotation',
  );
  const ray = new T.Ray(outside, through.clone().sub(outside).normalize());
  const hit = rayCollider(T, ray, box, new T.Vector3());
  assert.ok(hit.distanceTo(outside.clone().lerp(through, t)) < 1e-8);
  assert.equal(sweptBoxProximity(missA.toArray(), missB.toArray(), box, 0.0001), null);
  assert.equal(
    colliderContainsXZ(box, outside.x, outside.z),
    false,
    'empty corner cannot become support',
  );
  assert.ok(
    box.clone().expandByScalar(0.001).containsPoint(centre),
    'aircraft clone/expansion retains frame',
  );
  const state = {
    p: centre.toArray(),
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    hp: 100,
    fuelAvailable: true,
  };
  // With no driving input, a ground vehicle must not acquire phantom support
  // at an empty local corner of the oriented footprint.
  const empty = world(6.3, 0, 3.9);
  state.p = empty.toArray();
  state.p[1] = 0.2 + VEHICLES.castor.gear;
  stepTank(T, state, {}, [box], 1 / 60, VEHICLES.castor);
  stepTank(T, state, {}, [box], 1 / 60, VEHICLES.castor);
  assert.ok(state.p[1] < 0.2 + VEHICLES.castor.gear, 'ground vehicle falls in the empty corner');
}
console.log(
  'Rotated station: translated bounds, positive/negative ray hits, swept spheres, aircraft expansion and ground support',
);

// Placement must not treat the broad AABB's empty corner as a real roof.
const { supportedPlacement } = await import('../src/equipment.js');
const roofStation = makeServiceStation(T, 'refuel');
roofStation.scale.setScalar(MAP.ratio);
roofStation.rotation.y = Math.PI / 4;
const roof = makeRefuelCollider(T, roofStation);
const falseRoof = { x: roof.min.x + 0.0091, y: roof.max.y, z: roof.min.z + 0.0066, angle: 0 };
assert.equal(roof.containsPoint(new T.Vector3(falseRoof.x, falseRoof.y, falseRoof.z)), false);
assert.equal(
  supportedPlacement(falseRoof, [roof], [], 'bed'),
  null,
  'empty diagonal corner must not support a placement',
);
const { footprintOverlapsCollider } = await import('../src/oriented-collider.js');
assert.equal(
  footprintOverlapsCollider(
    roof,
    { x: roof.max.x - 0.0001, z: roof.max.z - 0.0001 },
    0.00005,
    0.00005,
    0,
  ),
  false,
  'empty AABB corner must not block a placement',
);
assert.equal(footprintOverlapsCollider(roof, { x: 0, z: 0 }, 0.001, 0.001, 0), true);
const f = roof.oriented;
for (const x of [f.bounds.min.x, f.bounds.max.x])
  for (const z of [f.bounds.min.z, f.bounds.max.z]) {
    const p = new T.Vector3(f.x + f.c * x + f.s * z, f.bounds.min.y, f.z - f.s * x + f.c * z);
    assert.ok(
      p.x >= roof.min.x - 1e-10 &&
        p.x <= roof.max.x + 1e-10 &&
        p.z >= roof.min.z - 1e-10 &&
        p.z <= roof.max.z + 1e-10,
      'broad phase encloses every oriented-box corner',
    );
  }
