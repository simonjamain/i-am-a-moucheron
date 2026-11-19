// Anti-air truck on Rapier: tractor and gun trailer on a hitch, scale, running gear
// against the model's vertices, driving, jackknife, walls and falls, run headless
// against vendor/rapier.compat.mjs. Feel still needs a real drive (docs/physics-engine.md).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { ACTOR_UNIT, MAP } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { MODEL_DATA } from '../src/meshy-flaktruck-data.js';
import { MODEL_UNIT, loadRapier, toPhysics, toWorld } from '../src/physics-world.ts';
import { HITCH_LIMIT, TRUCK_PHYSICS, TruckRig } from '../src/truck-physics.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const profile = VEHICLES.flaktruck;
const DT = 1 / 120;

// Scale: a real 6 t truck and a ~2 t gun trailer at the model's scale (Froude).
const tractorLength = (0.8671 + 4.3) * MODEL_UNIT;
const scale = tractorLength / 6;
assert.ok(
  Math.abs(TRUCK_PHYSICS.tractorMass - 6000 * scale ** 3) < 0.2 * TRUCK_PHYSICS.tractorMass,
);
const trailerTonnes = TRUCK_PHYSICS.trailerMass / scale ** 3;
assert.ok(trailerTonnes > 1500 && trailerTonnes < 2500, 'trailer ' + trailerTonnes + ' kg');
const topSpeed = toPhysics(MAP.metres(profile.maxSpeed));
assert.ok(Math.abs(topSpeed - (40 / 3.6) * Math.sqrt(scale)) < 0.4, 'top speed ' + topSpeed);
assert.ok(HITCH_LIMIT < 0.65, 'inside the angle the server accepts');

// Running gear against the model: low vertices cluster on the axles.
{
  const lowZ = (name, threshold) => {
    const part = MODEL_DATA.parts.find((p) => p.part === name);
    const bytes = Buffer.from(part.positions, 'base64');
    const raw = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const zs = [];
    for (let i = 0; i < raw.length; i += 3)
      if (raw[i + 1] * 0.0005 < threshold) zs.push(raw[i + 2] * 0.0005);
    return zs;
  };
  const tractor = lowZ('body', -0.68),
    trailer = lowZ('trailer', -0.5);
  assert.ok(Math.min(...tractor) < -3.3 && Math.min(...tractor) > -4.0, 'front axle');
  assert.ok(Math.max(...tractor) > -0.1 && Math.max(...tractor) < 0.4, 'rear tandem');
  assert.ok(Math.min(...trailer) > 1.2 && Math.max(...trailer) < 2.8, 'trailer axles');
}

const fresh = (x = 0, z = 0, y = 0) => ({
  p: [toWorld(x), y + 0.8 * ACTOR_UNIT, toWorld(z)],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
  trailerAngle: 0,
});
const speed = (s) => Math.hypot(toPhysics(s.v[0]), toPhysics(s.v[2])); // horizontal
const run = (rig, state, controls, seconds, solids = [], each) => {
  for (let i = 0; i < seconds * 120; i++) {
    rig.step(state, controls, solids, DT, profile);
    each?.(i);
  }
};
const up = (s) => new T.Vector3(0, 1, 0).applyQuaternion(new T.Quaternion().fromArray(s.q)).y;
const box = (x0, y0, z0, x1, y1, z1) =>
  new T.Box3(
    new T.Vector3(toWorld(x0), toWorld(y0), toWorld(z0)),
    new T.Vector3(toWorld(x1), toWorld(y1), toWorld(z1)),
  );

// Rest: the tractor at the model's ride height, the trailer on its own wheels, level.
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 3);
  assert.ok(Math.abs(s.p[1] - 0.8 * ACTOR_UNIT) < 0.02 * ACTOR_UNIT, 'ride height');
  assert.equal(s.landed, true);
  assert.ok(speed(s) < 0.03, 'parked');
  for (let i = 0; i < 4; i++)
    assert.ok(rig.trailerWheels.wheelIsInContact(i), 'trailer wheel ' + i);
  assert.ok(Math.abs(s.trailerAngle) < 0.01, 'trailer in line');
  const hinge = rig.trailer.translation(),
    base = rig.tractor.translation();
  assert.ok(Math.abs((hinge.y - base.y) / MODEL_UNIT + 0.18) < 0.03, 'trailer rides on the hitch');
  rig.dispose();
}

// Straight driving: progressive start, top speed, trailer in line, brakes hold both.
{
  const rig = new TruckRig(RAPIER),
    s = fresh(),
    marks = {};
  run(rig, s, { forward: 1 }, 9, [], (i) => {
    if ((i + 1) % 120 === 0) marks[(i + 1) / 120] = -toPhysics(s.v[2]);
    assert.ok(speed(s) < topSpeed * 1.03, 'never above the top speed');
    assert.ok(Math.abs(s.trailerAngle) < 0.03, 'trailer follows in line');
  });
  assert.ok(marks[1] > 1.5 && marks[1] < 3.2, 'about 2.4 m/s² at the start: ' + marks[1]);
  assert.ok(marks[8] > 0.95 * topSpeed, 'reaches the top speed: ' + marks[8]);
  assert.ok(Math.abs(s.p[0]) < toWorld(0.1) && s.p[2] < 0, 'straight along -z');
  run(rig, s, {}, 5);
  assert.ok(speed(s) < 0.05, 'coasts to a stop and holds');
  run(rig, s, { forward: 1 }, 7);
  const before = speed(s);
  let fold = 0;
  run(rig, s, { forward: -1 }, 0.8, [], () => (fold = Math.max(fold, Math.abs(s.trailerAngle))));
  const deceleration = (before - speed(s)) / 0.8;
  assert.ok(deceleration > 4 && deceleration < 8, 'braking about 5.5 m/s²: ' + deceleration);
  assert.ok(fold < 0.1, 'braking does not fold the trailer: ' + fold);
  rig.dispose();
}

// Bends: the trailer swings out opposite to the turn, the truck stays upright and
// does not ring after a kick of the steering wheel.
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 6);
  run(rig, s, { forward: 1, turn: 1 }, 4);
  assert.ok(s.omega[1] > 0.3, 'left is positive yaw: ' + s.omega[1]);
  assert.ok(s.trailerAngle < -0.03 && s.trailerAngle > -0.4, 'trailer swings: ' + s.trailerAngle);
  assert.ok(Math.abs(s.omega[1]) * speed(s) < 0.35 * 9.81, 'lateral acceleration');
  assert.ok(up(s) > 0.99, 'upright');
  run(rig, s, { forward: 1 }, 4);
  assert.ok(Math.abs(s.trailerAngle) < 0.02, 'straightens out: ' + s.trailerAngle);
  const zig = new TruckRig(RAPIER),
    z = fresh();
  run(zig, z, { forward: 1 }, 3);
  let worst = 1,
    swing = 0;
  for (let k = 0; k < 16; k++)
    run(zig, z, { forward: 1, turn: k % 2 ? 1 : -1 }, 1, [], () => {
      worst = Math.min(worst, up(z));
      swing = Math.max(swing, Math.abs(z.trailerAngle));
    });
  assert.ok(worst > 0.95 && swing < HITCH_LIMIT, `zig-zag: up ${worst}, swing ${swing}`);
  [rig, zig].forEach((r) => r.dispose());
}

// Reversing: straight is fine; steering while backing jackknifes against the hitch
// stop (never beyond the server's ±0.65), and the truck stops.
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: -1 }, 3);
  assert.ok(s.p[2] > 0 && Math.abs(s.trailerAngle) < 0.05, 'backs up straight');
  const back = new TruckRig(RAPIER),
    b = fresh();
  let largest = 0;
  run(
    back,
    b,
    { forward: -1, turn: 0.5 },
    12,
    [],
    () => (largest = Math.max(largest, Math.abs(b.trailerAngle))),
  );
  assert.ok(largest > HITCH_LIMIT - 0.03 && largest <= 0.65, 'jackknife to the stop: ' + largest);
  assert.ok(
    speed(b) < 0.45 * topSpeed * TRUCK_PHYSICS.reverseSpeed * 2,
    'and the jammed truck barely moves: ' + speed(b),
  );
  run(back, b, { forward: 1 }, 6);
  assert.ok(Math.abs(b.trailerAngle) < 0.3, 'driving forward straightens the trailer');
  [rig, back].forEach((r) => r.dispose());
}

// A wall stops the tractor; the game moving the vehicle places both bodies; falls kill.
{
  const wall = box(-10, 0, -21, 10, 3, -20),
    rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 8, [wall]);
  assert.ok(toPhysics(s.p[2]) > -20 && toPhysics(s.p[2]) < -17, 'stopped at the wall');
  assert.ok(s.hp === 100, 'no damage');
  const moved = fresh(30, -30);
  moved.trailerAngle = 0.3;
  Object.assign(s, moved);
  rig.step(s, {}, [], DT, profile);
  assert.ok(Math.abs(toPhysics(s.p[0]) - 30) < 0.1 && Math.abs(toPhysics(s.p[2]) + 30) < 0.1);
  assert.ok(Math.abs(s.trailerAngle - 0.3) < 0.05, 'trailer angle taken from the state');
  rig.dispose();
  const drop = (height) => {
    const solid = box(-10, 0, -40, 10, toPhysics(height), 10),
      r = new TruckRig(RAPIER),
      st = fresh(0, 0, height);
    run(r, st, { forward: 1 }, 24, [solid]);
    r.dispose();
    return st;
  };
  assert.equal(drop(0.75).hp, 0, 'desk');
  assert.equal(drop(0.004).hp, 100, '4 mm step');
}

console.log('truck physics ok: scale, mesh axles, hitch, bends, jackknife, walls, falls');
