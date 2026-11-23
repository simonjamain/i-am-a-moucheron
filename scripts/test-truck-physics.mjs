// Anti-air truck on Rapier: tractor and gun trailer on a hitch, scale, running gear
// against the model's vertices, driving, jackknife, walls and falls, run headless
// against vendor/rapier.compat.mjs. Feel still needs a real drive (docs/physics-engine.md).
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { ACTOR_UNIT, MAP } from '../src/scale.ts';
import { TRAILER_LIMITS, VEHICLES } from '../src/fleet.ts';
import { MODEL_DATA } from '../src/meshy-flaktruck-data.ts';
import { MODEL_UNIT, loadRapier, toPhysics, toWorld } from '../src/physics-world.ts';
import {
  HITCH_LIMITS,
  TRACTOR_WHEELS,
  TRAILER_WHEELS,
  TRAILER_WHEEL_RADIUS,
  TRUCK_PHYSICS,
  WHEEL_RADIUS,
  TruckRig,
} from '../src/truck-physics.ts';

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
// Twice what the real truck would reach, as asked for the game.
assert.ok(Math.abs(topSpeed - 2 * (40 / 3.6) * Math.sqrt(scale)) < 0.8, 'top speed ' + topSpeed);
assert.ok(HITCH_LIMITS.yaw < TRAILER_LIMITS.yaw && HITCH_LIMITS.pitch < TRAILER_LIMITS.pitch);
assert.ok(HITCH_LIMITS.yaw >= Math.PI / 2, 'the trailer can turn by at least 90°');

// Running gear: the wheels are parts of the model (scripts/split-vehicle-parts.mjs), with
// their pivot at the centre; the physics reads these pivots and the meshes' size.
{
  const wheelPart = (name) => MODEL_DATA.parts.find((p) => p.part === name);
  const size = (part) => {
    const bytes = Buffer.from(part.positions, 'base64');
    const raw = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < raw.length; i += 3)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], raw[i + a] * 0.0005);
        hi[a] = Math.max(hi[a], raw[i + a] * 0.0005);
      }
    return hi.map((v, a) => v - lo[a]);
  };
  for (let i = 0; i < 6; i++) {
    const part = wheelPart('wheel' + i);
    assert.ok(part, 'tractor wheel ' + i);
    assert.ok(Math.abs(size(part)[1] / 2 - WHEEL_RADIUS / MODEL_UNIT) < 0.02, 'tractor radius');
    assert.ok(Math.abs(TRACTOR_WHEELS[i].x - part.pivot[0] * MODEL_UNIT) < 1e-9);
  }
  for (let i = 0; i < 4; i++) {
    const part = wheelPart('trailerWheel' + i);
    assert.ok(part, 'trailer wheel ' + i);
    assert.ok(
      Math.abs(size(part)[1] / 2 - TRAILER_WHEEL_RADIUS / MODEL_UNIT) < 0.02,
      'trailer radius',
    );
    assert.ok(TRAILER_WHEELS[i].z > 0, 'behind the hitch');
  }
  // Nothing was lost in the split: same triangles as the original module.
  const triangles = MODEL_DATA.parts.reduce(
    (n, p) => n + Buffer.from(p.indices, 'base64').length / 6,
    0,
  );
  assert.equal(triangles, MODEL_DATA.triangles, 'every triangle is still there');
  assert.equal(TRACTOR_WHEELS.length, 6);
  assert.equal(TRAILER_WHEELS.length, 4);
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
  run(rig, s, { forward: 1 }, 36, [], (i) => {
    if ((i + 1) % 120 === 0) marks[(i + 1) / 120] = -toPhysics(s.v[2]);
    assert.ok(speed(s) < topSpeed * 1.03, 'never above the top speed');
    assert.ok(Math.abs(s.trailerAngle) < 0.03, 'trailer follows in line');
  });
  assert.ok(marks[1] > 0.8 && marks[1] < 1.7, 'about 1.2 m/s² at the start: ' + marks[1]);
  assert.ok(marks[8] < 0.8 * topSpeed, 'a calm acceleration: ' + marks[8]);
  assert.ok(marks[35] > 0.93 * topSpeed, 'reaches the top speed: ' + marks[35]);
  assert.ok(Math.abs(s.p[0]) < 0.01 * Math.abs(s.p[2]) && s.p[2] < 0, 'straight along -z');
  const before = speed(s);
  let fold = 0,
    pitch = 0;
  run(rig, s, { forward: -1 }, 0.8, [], () => {
    fold = Math.max(fold, Math.abs(s.trailerAngle));
    pitch = Math.max(pitch, Math.abs(s.trailerPitch));
  });
  // The ball hitch lets the trailer pitch against the tractor under braking.
  assert.ok(pitch > 0.015 && pitch < TRAILER_LIMITS.pitch, 'the trailer pitches: ' + pitch);
  const deceleration = (before - speed(s)) / 0.8;
  assert.ok(deceleration > 4 && deceleration < 8, 'braking about 5.5 m/s²: ' + deceleration);
  assert.ok(fold < 0.1, 'braking does not fold the trailer: ' + fold);
  run(rig, s, {}, 12);
  assert.ok(speed(s) < 0.05, 'coasts to a stop and holds');
  assert.ok(Math.abs(s.trailerPitch) < 0.03, 'the trailer settles level: ' + s.trailerPitch);
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
  assert.ok(worst > 0.95 && swing < HITCH_LIMITS.yaw, `zig-zag: up ${worst}, swing ${swing}`);
  [rig, zig].forEach((r) => r.dispose());
}

// Reversing: straight is fine at first (a trailer is unstable backwards, a sway-control hitch
// slows it down); full lock while backing folds the trailer; the hitch allows over 90° and
// stops at 100°.
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: -1 }, 2);
  assert.ok(s.p[2] > 0 && Math.abs(s.trailerAngle) < 0.05, 'backs up straight at first');
  const back = new TruckRig(RAPIER),
    b = fresh();
  let largest = 0;
  run(back, b, {}, 2);
  run(back, b, { forward: -1 }, 1);
  run(
    back,
    b,
    { forward: -1, turn: 1 },
    13,
    [],
    () => (largest = Math.max(largest, Math.abs(b.trailerAngle))),
  );
  assert.ok(
    largest > 0.7 && largest <= TRAILER_LIMITS.yaw,
    'the trailer folds (> 40°): ' + largest,
  );
  // The hitch really allows more than 90°: placed at 97° it is not pushed back by a stop,
  // and backing with full lock never takes it beyond its stop.
  const folded = new TruckRig(RAPIER),
    f = fresh();
  f.trailerAngle = 1.7;
  let past = 0;
  run(
    folded,
    f,
    { forward: -1, turn: 1 },
    6,
    [],
    () => (past = Math.max(past, Math.abs(f.trailerAngle))),
  );
  assert.ok(past > Math.PI / 2 && past <= TRAILER_LIMITS.yaw, 'past 90°, within the stop: ' + past);
  folded.dispose();
  assert.ok(
    speed(b) < 0.45 * topSpeed * TRUCK_PHYSICS.reverseSpeed * 2,
    'and a jammed truck barely moves: ' + speed(b),
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
  moved.trailerPitch = 0.1;
  Object.assign(s, moved);
  rig.step(s, {}, [], DT, profile);
  assert.ok(Math.abs(toPhysics(s.p[0]) - 30) < 0.1 && Math.abs(toPhysics(s.p[2]) + 30) < 0.1);
  assert.ok(Math.abs(s.trailerAngle - 0.3) < 0.05, 'trailer angle taken from the state');
  assert.ok(Math.abs(s.trailerPitch - 0.1) < 0.05, 'and its pitch');
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

// Steering as a driver does it: only the front axle turns, by an angle that exists at a
// standstill, is rate-limited, closes with speed, and is part of the state (the renderer
// and the other players draw the wheels from it).
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 2);
  assert.equal(s.steer, 0);
  run(rig, s, { turn: 1 }, 0.1);
  assert.ok(
    s.steer > 0 && s.steer < TRUCK_PHYSICS.steerLock,
    'turned at a limited rate: ' + s.steer,
  );
  run(rig, s, { turn: 1 }, 1);
  assert.ok(Math.abs(s.steer - TRUCK_PHYSICS.steerLock) < 1e-6, 'full lock at a standstill');
  assert.ok(speed(s) < 0.05, 'without moving');
  const angles = [0, 1, 2, 3, 4, 5].map((i) => rig.tractorWheels.wheelSteering(i));
  assert.ok(Math.abs(angles[0]) > 0.3 && Math.abs(angles[1]) > 0.3, 'the front wheels turn');
  assert.ok(
    angles.slice(2).every((a) => a === 0),
    'the two rear axles are fixed',
  );
  run(rig, s, { turn: -1 }, 3);
  assert.ok(Math.abs(s.steer + TRUCK_PHYSICS.steerLock) < 1e-6, 'and the other way');
  run(rig, s, {}, 2);
  assert.ok(Math.abs(s.steer) < 1e-6, 'released to the centre');
  // At speed the lock closes.
  run(rig, s, { forward: 1 }, 25);
  run(rig, s, { turn: 1 }, 1);
  assert.ok(s.steer < 0.2 * TRUCK_PHYSICS.steerLock, 'less lock at speed: ' + s.steer);
  rig.dispose();
}

// The trailer's geometry is the model's: wheels behind the hitch, resting level on the same
// ground, the hull between the two ends of the trailer.
{
  const rig = new TruckRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 3);
  for (let i = 0; i < 4; i++) {
    assert.ok(rig.trailerWheels.wheelIsInContact(i), 'trailer wheel ' + i + ' on the ground');
    const point = rig.trailerWheels.wheelHardPoint(i);
    assert.ok(point && Math.abs(point.y - rig.trailer.translation().y) < 1, 'sane');
  }
  assert.ok(Math.abs(s.trailerPitch) < 0.02, 'level: ' + s.trailerPitch);
  assert.ok(TRAILER_WHEELS.every((w) => w.z > 1.2 * MODEL_UNIT && w.z < 2.7 * MODEL_UNIT));
  rig.dispose();
}

console.log('truck physics ok: scale, mesh axles, hitch, bends, jackknife, walls, falls');
