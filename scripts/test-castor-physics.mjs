// Castor on Rapier: physics units, wheel geometry, driving, collisions and the
// room's solids, run headless against the same vendor/rapier.compat.mjs the
// browser loads (?rapier). Feel still needs a real drive, see docs/physics-engine.md.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MAP, ACTOR_UNIT } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { colliderContainsXZ, orientedBox, rayCollider } from '../src/oriented-collider.ts';
import {
  HUMAN_HEIGHT,
  PILOT_MODEL_UNITS,
  WORLD_PER_METRE,
  MODEL_UNIT,
  PhysicsWorld,
  loadRapier,
  toPhysics,
  toWorld,
} from '../src/physics-world.js';
import {
  CASTOR_PHYSICS,
  CastorRig,
  FALL_KILL_SPEED,
  WHEELS,
  WHEELBASE,
  steerLimit,
  wheelSteering,
} from '../src/castor-physics.js';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const profile = VEHICLES.castor;
const DT = 1 / 120;

// Units: a pilot is 1.8 m in the physics, whatever the world size.
assert.equal(HUMAN_HEIGHT, 1.8);
assert.ok(Math.abs(WORLD_PER_METRE * HUMAN_HEIGHT - ACTOR_UNIT * PILOT_MODEL_UNITS) < 1e-12);
assert.ok(Math.abs(WORLD_PER_METRE - MAP.metres(10.4 / 1.8)) < 1e-12);
assert.ok(Math.abs(MODEL_UNIT - 1.8 / 5.6) < 1e-12);
assert.ok(Math.abs(toWorld(toPhysics(0.123)) - 0.123) < 1e-15);
const vmax = toPhysics(MAP.metres(profile.maxSpeed));
assert.ok(vmax > 8 && vmax < 10, 'top speed ' + vmax + ' m/s keeps the previous 52 reference m/s');

// Wheels come from the model: 6x6, front axle steers, the middle axle is the pivot.
assert.equal(WHEELS.length, 6);
const zs = [...new Set(WHEELS.map((w) => w.z.toFixed(3)))].map(Number).sort((a, b) => a - b);
assert.equal(zs.length, 3);
assert.ok(WHEELBASE > 0.6 && WHEELBASE < 0.9);

// Steering geometry: front wheels turn left (positive), rear ones the other way,
// the pivot axle stays straight and the inner wheel turns more (Ackermann).
const axle = (z) => WHEELS.filter((w) => Math.abs(w.z - z) < 1e-3);
const [leftFront, rightFront] = axle(zs[0]).sort((a, b) => a.x - b.x);
assert.ok(leftFront.x < 0 && rightFront.x > 0);
const innerAngle = wheelSteering(0.4, leftFront),
  outerAngle = wheelSteering(0.4, rightFront);
assert.ok(innerAngle > outerAngle && outerAngle > 0.2, 'inner wheel turns more');
for (const w of WHEELS) {
  assert.ok(Math.abs(wheelSteering(0, w)) < 1e-9);
  assert.ok(
    Math.abs(wheelSteering(-0.4, { x: -w.x, y: w.y, z: w.z }) + wheelSteering(0.4, w)) < 1e-9,
    'right turn mirrors the left turn',
  );
}
assert.ok(wheelSteering(0.4, axle(zs[2])[0]) < 0, 'rear axle steers the opposite way');
assert.ok(Math.abs(wheelSteering(0.4, axle(zs[1])[0])) < 1e-9, 'pivot axle');

// The lock closes with speed, never asking the tyres for more than maxLateral.
assert.equal(steerLimit(0), CASTOR_PHYSICS.steerLock);
assert.ok(steerLimit(vmax) < 0.08, 'lock at top speed ' + steerLimit(vmax));
for (const v of [1, 2, 4, 6, vmax]) {
  const lateral = (v * v * Math.tan(steerLimit(v))) / WHEELBASE;
  assert.ok(lateral <= CASTOR_PHYSICS.maxLateral + 1e-9, 'lateral ' + lateral + ' at ' + v);
}

const fresh = (x = 0, z = 0, y = 0) => ({
  p: [toWorld(x), y + 0.8 * ACTOR_UNIT, toWorld(z)],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
});
const speed = (s) => Math.hypot(...s.v.map(toPhysics));
const along = (s) => -toPhysics(s.v[2]); // forward is -z at zero heading
const run = (rig, state, controls, seconds, solids = [], each) => {
  for (let i = 0; i < seconds * 120; i++) {
    rig.step(state, controls, solids, DT, profile);
    each?.(i);
  }
};
const up = (s) => new T.Vector3(0, 1, 0).applyQuaternion(new T.Quaternion().fromArray(s.q)).y;

// Rest: on its springs at the model's ride height, all wheels on the floor.
{
  const rig = new CastorRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 2);
  assert.ok(Math.abs(s.p[1] - 0.8 * ACTOR_UNIT) < 0.03 * ACTOR_UNIT, 'ride height');
  assert.equal(s.landed, true);
  assert.ok(speed(s) < 0.05, 'stays parked');
  rig.dispose();
}

// Acceleration is progressive, forward is -z, top speed is the profile's.
{
  const rig = new CastorRig(RAPIER),
    s = fresh(),
    marks = {};
  run(rig, s, { forward: 1 }, 7, [], (i) => {
    if ((i + 1) % 120 === 0) marks[(i + 1) / 120] = along(s);
    assert.ok(along(s) < vmax * 1.02, 'never above the top speed');
  });
  assert.ok(marks[1] > 2.8 && marks[1] < 4.6, 'about 4 m/s² at the start: ' + marks[1]);
  assert.ok(marks[1] < 0.6 * vmax, 'a progressive start');
  assert.ok(marks[6] > 0.9 * vmax, 'reaches the top speed: ' + marks[6]);
  assert.ok(s.p[2] < 0 && Math.abs(s.p[0]) < toWorld(0.05), 'drives straight along -z');
  assert.ok(Math.abs(s.gas - 1) < 1e-9);
  // Coasting brakes gently (about 1.2 m/s²), a throttle against the motion
  // brakes hard (about 7 m/s²) and then reverses.
  const v0 = along(s);
  run(rig, s, {}, 1);
  const coast = v0 - along(s);
  assert.ok(coast > 0.8 && coast < 1.8, 'engine braking ' + coast);
  run(rig, s, { forward: 1 }, 6);
  const v1 = along(s);
  run(rig, s, { forward: -1 }, 0.6);
  const brake = (v1 - along(s)) / 0.6;
  assert.ok(brake > 5 && brake < 9.5, 'braking ' + brake);
  run(rig, s, { forward: -1 }, 6);
  assert.ok(along(s) < -0.4 * vmax && along(s) > -0.6 * vmax, 'reverses slower: ' + along(s));
  rig.dispose();
}

// Steering: a real wheeled vehicle. At low speed the lock gives the bicycle
// model's yaw rate; at speed it is limited so that the tyres hold the corner.
{
  const rig = new CastorRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 0.3, turn: 1 }, 4);
  const v = speed(s);
  const bicycle = (v * Math.tan(steerLimit(v))) / WHEELBASE;
  assert.ok(s.omega[1] > 0.5, 'left is positive yaw');
  assert.ok(Math.abs(s.omega[1] - bicycle) < 0.3 * bicycle, `yaw ${s.omega[1]} vs ${bicycle}`);
  const turned = new CastorRig(RAPIER),
    f = fresh();
  run(turned, f, { forward: 1, turn: 1 }, 8);
  const lateral = Math.abs(f.omega[1]) * speed(f);
  assert.ok(
    speed(f) > 0.9 * vmax && lateral < 1.15 * CASTOR_PHYSICS.maxLateral,
    'lateral ' + lateral,
  );
  // Reversing flips the yaw, like a car (the Castor's old reverseSteering).
  const back = new CastorRig(RAPIER),
    b = fresh();
  run(back, b, { forward: -0.4, turn: 1 }, 4);
  assert.ok(b.omega[1] < -0.2, 'reverse + left yaws right: ' + b.omega[1]);
  // The steering wheel is released at a limited rate.
  run(rig, s, { forward: 0.3, turn: 0 }, 0.1);
  assert.ok(rig.steer > 0, 'not instantaneous');
  run(rig, s, { forward: 0.3, turn: 0 }, 2);
  assert.ok(Math.abs(rig.steer) < 1e-6, 'back to centre');
  [rig, turned, back].forEach((r) => r.dispose());
}

// No rollover when zig-zagging at full speed.
{
  const rig = new CastorRig(RAPIER),
    s = fresh();
  let worst = 1;
  run(rig, s, { forward: 1, turn: 1 }, 20, [], (i) => {
    worst = Math.min(worst, up(s));
  });
  const zig = new CastorRig(RAPIER),
    z = fresh();
  run(zig, z, { forward: 1 }, 8);
  run(zig, z, { forward: 1, turn: -1 }, 0.5);
  for (let k = 0; k < 20; k++)
    run(
      zig,
      z,
      { forward: 1, turn: k % 2 ? 1 : -1 },
      1,
      [],
      () => (worst = Math.min(worst, up(z))),
    );
  assert.ok(worst > 0.9, 'stays upright: ' + worst);
  rig.dispose();
  zig.dispose();
}

const box = (x0, y0, z0, x1, y1, z1) =>
  new T.Box3(
    new T.Vector3(toWorld(x0), y0, toWorld(z0)),
    new T.Vector3(toWorld(x1), y1, toWorld(z1)),
  );

// A wall stops it without tunnelling or bouncing back; removing the wall from
// the room's list frees the way (the placement list is diffed on every step).
{
  const wall = box(-10, 0, -21, 10, toWorld(3), -20),
    solids = [wall],
    rig = new CastorRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 9, solids);
  assert.ok(toPhysics(s.p[2]) > -20 && toPhysics(s.p[2]) < -18, 'stopped at the wall');
  assert.ok(speed(s) < 0.2, 'no rebound');
  assert.ok(up(s) > 0.98 && s.hp === 100, 'no damage, no flip');
  solids.pop();
  run(rig, s, { forward: 1 }, 3, solids);
  assert.ok(toPhysics(s.p[2]) < -22, 'passes once the solid is gone');
  solids.push(box(-10, 0, -60, 10, toWorld(3), -59));
  assert.equal(rig.physics.solids.size, 0, 'only synced on the next step');
  run(rig, s, {}, 0.1, solids);
  assert.equal(rig.physics.solids.size, 1);
  rig.dispose();
}

// A rotated box blocks along its own faces: Rapier's solids give the same ray
// hits as the game's rayCollider for every kind of box.
{
  const rotated = orientedBox(T, box(-30, 0, -22, 30, toWorld(3), -18), {
    x: 0,
    z: toWorld(-20),
    c: Math.cos(0.5),
    s: Math.sin(0.5),
    bounds: new T.Box3(
      new T.Vector3(toWorld(-12), 0, toWorld(-1.5)),
      new T.Vector3(toWorld(20), toWorld(3), toWorld(1.5)),
    ),
  });
  const plain = box(5, 0, -8, 9, toWorld(3), -3);
  const world = new PhysicsWorld(RAPIER);
  world.sync([rotated, plain]);
  world.world.step();
  let compared = 0,
    seed = 3;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let n = 0; n < 400; n++) {
    const origin = new T.Vector3(
        toWorld((random() - 0.5) * 60),
        toWorld(1),
        toWorld((random() - 0.5) * 60),
      ),
      angle = random() * Math.PI * 2,
      direction = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
    for (const [candidate, index] of [
      [rotated, 0],
      [plain, 1],
    ]) {
      const expected = rayCollider(T, new T.Ray(origin, direction), candidate, new T.Vector3());
      const hit = world.world.castRay(
        new RAPIER.Ray(
          { x: toPhysics(origin.x), y: toPhysics(origin.y), z: toPhysics(origin.z) },
          direction,
        ),
        1000,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => collider === world.solids.get(candidate).collider,
      );
      assert.equal(!!hit, !!expected, 'same hit/miss');
      // From inside, Rapier reports 0 and the game the exit point: compare the
      // entry distance only for rays that start outside.
      if (expected && !colliderContainsXZ(candidate, origin.x, origin.z)) {
        assert.ok(
          Math.abs(toWorld(hit.timeOfImpact) - origin.distanceTo(expected)) < toWorld(0.02),
          'same distance',
        );
        compared++;
      }
    }
  }
  assert.ok(compared > 60, 'enough rays hit the boxes: ' + compared);
  world.dispose();
}

// The game may move the vehicle (placement, respawn): the rig follows its state.
{
  const rig = new CastorRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 2);
  s.p = [toWorld(40), 0.8 * ACTOR_UNIT, toWorld(-40)];
  s.v = [0, 0, 0];
  run(rig, s, {}, 1);
  assert.ok(Math.abs(toPhysics(s.p[0]) - 40) < 0.1 && Math.abs(toPhysics(s.p[2]) + 40) < 0.1);
  assert.ok(speed(s) < 0.1, 'speed taken from the state');
  rig.dispose();
}

// Falling off a desk kills as before (a drop above ~6 cm of the office, kept as
// a height), a small step does not.
{
  const drop = (height) => {
    const top = toWorld(0) + height,
      solid = box(-10, 0, -40, 10, top, 10),
      rig = new CastorRig(RAPIER),
      s = fresh(0, 0, top);
    run(rig, s, { forward: 1 }, 14, [solid], () => 0);
    rig.dispose();
    return s;
  };
  assert.equal(drop(0.75).hp, 0, 'desk');
  assert.equal(drop(0.004).hp, 100, '4 mm step');
  assert.ok(FALL_KILL_SPEED > 7 && FALL_KILL_SPEED < 10);
}

console.log('castor physics ok: units, 6x6 steering, driving, walls, oriented solids, falls');
