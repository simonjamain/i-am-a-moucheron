// Medium tank on Rapier: scale, running gear against the hull mesh, springs, tracked
// driving, walls, steps and falls, run headless against vendor/rapier.compat.mjs.
// Feel still needs a real drive, see docs/physics-engine.md.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { ACTOR_UNIT, MAP } from '../src/scale.ts';
import { VEHICLES } from '../src/fleet.ts';
import { MODEL_DATA } from '../src/meshy-tank-data.js';
import { GRAVITY, MODEL_UNIT, loadRapier, toPhysics, toWorld } from '../src/physics-world.ts';
import {
  GROUND_CLEARANCE,
  TANK_PHYSICS,
  TRACK_X,
  WHEEL_COUNT,
  WHEEL_RADIUS,
  WHEEL_Z,
  TankRig,
} from '../src/tank-physics.ts';

const RAPIER = await loadRapier(() => import('../vendor/rapier.compat.mjs'));
const profile = VEHICLES.tank;
const DT = 1 / 120;

// Scale: the model is a real medium tank at the model's size (Froude similarity).
const hullLength = 3.82 * MODEL_UNIT; // hull of the mesh: z from -1.67 to 2.15
const scale = hullLength / 5.9; // a 5.9 m Sherman hull
assert.ok(Math.abs(TANK_PHYSICS.mass - 30000 * scale ** 3) < 0.15 * TANK_PHYSICS.mass, 'mass');
const topSpeed = toPhysics(MAP.metres(profile.maxSpeed));
assert.ok(Math.abs(topSpeed - (40 / 3.6) * Math.sqrt(scale)) < 0.4, 'top speed ' + topSpeed);
assert.ok(profile.turn > 1 && profile.turn < 1.6, 'pivot command 1/√scale times 0.6 rad/s');

// Running gear against the mesh: low vertices sit on the contact patch, the track
// body spans the measured |x|.
{
  const body = MODEL_DATA.parts.find((p) => p.part === 'body');
  const bytes = Buffer.from(body.positions, 'base64');
  const raw = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  const points = [];
  for (let i = 0; i < raw.length; i += 3)
    points.push([raw[i] * 0.0005, raw[i + 1] * 0.0005, raw[i + 2] * 0.0005]);
  const low = points.filter((p) => p[1] < -0.7);
  const zs = low.map((p) => p[2] * MODEL_UNIT);
  assert.ok(Math.abs(Math.min(...zs) - WHEEL_Z[0]) < 0.06, 'front of the contact patch');
  assert.ok(Math.abs(Math.max(...zs) - WHEEL_Z.at(-1)) < 0.06, 'rear of the contact patch');
  const outer = points.filter((p) => p[0] > 0.6);
  const xs = outer.map((p) => p[0] * MODEL_UNIT);
  assert.ok(Math.min(...xs) < TRACK_X && TRACK_X < Math.max(...xs), 'track centre line');
  assert.ok(Math.min(...points.map((p) => p[1])) * MODEL_UNIT > -GROUND_CLEARANCE - 1e-3);
  assert.equal(WHEEL_COUNT, 12);
  assert.ok(WHEEL_RADIUS > 0.08 && WHEEL_RADIUS < 0.12);
}

const fresh = (x = 0, z = 0, y = 0) => ({
  p: [toWorld(x), y + 0.8 * ACTOR_UNIT, toWorld(z)],
  q: [0, 0, 0, 1],
  v: [0, 0, 0],
  hp: 100,
});
const speed = (s) => Math.hypot(...s.v.map(toPhysics));
const run = (rig, state, controls, seconds, solids = [], each) => {
  for (let i = 0; i < seconds * 120; i++) {
    rig.step(state, controls, solids, DT, profile);
    each?.(i);
  }
};
const euler = (s) => new T.Euler().setFromQuaternion(new T.Quaternion().fromArray(s.q), 'YXZ');
const box = (x0, y0, z0, x1, y1, z1) =>
  new T.Box3(
    new T.Vector3(toWorld(x0), toWorld(y0), toWorld(z0)),
    new T.Vector3(toWorld(x1), toWorld(y1), toWorld(z1)),
  );

// Springs: at rest the hull sags by the design compression, level, on twelve springs.
{
  const rig = new TankRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 3);
  assert.ok(Math.abs(s.p[1] - 0.8 * ACTOR_UNIT) < 0.02 * ACTOR_UNIT, 'ride height');
  assert.equal(s.landed, true);
  assert.ok(speed(s) < 0.03, 'parked');
  for (const c of rig.wheelCompression)
    assert.ok(Math.abs(c - TANK_PHYSICS.sag) < 0.4 * TANK_PHYSICS.sag, 'sag ' + c);
  // Springs carry the weight: the total spring force at rest is the tank's weight.
  const load = rig.wheelCompression.reduce((sum, c) => sum + rig.stiffness * c, 0);
  assert.ok(Math.abs(load - TANK_PHYSICS.mass * GRAVITY) < 0.12 * TANK_PHYSICS.mass * GRAVITY);
  // 2.5 Hz: the Froude-scaled 1.1 Hz of a real tank's hull on its suspension.
  const hz = Math.sqrt((WHEEL_COUNT * rig.stiffness) / TANK_PHYSICS.mass) / (2 * Math.PI);
  assert.ok(hz > 2 && hz < 3, 'hull frequency ' + hz);
  rig.dispose();
}

// Driving straight: progressive start, top speed, nose dives under braking, holds still.
{
  const rig = new TankRig(RAPIER),
    s = fresh(),
    marks = {};
  let squat = 0;
  run(rig, s, { forward: 1 }, 6, [], (i) => {
    if ((i + 1) % 120 === 0) marks[(i + 1) / 120] = -toPhysics(s.v[2]);
    squat = Math.max(squat, euler(s).x);
    assert.ok(speed(s) < topSpeed * 1.03, 'never above the top speed');
  });
  assert.ok(marks[1] > 1.5 && marks[1] < 3, 'about 2.4 m/s² at the start: ' + marks[1]);
  assert.ok(marks[1] < 0.6 * topSpeed, 'a progressive start');
  assert.ok(marks[5] > 0.97 * topSpeed, 'reaches the top speed: ' + marks[5]);
  assert.ok(Math.abs(s.p[0]) < toWorld(0.1) && s.p[2] < 0, 'straight along -z');
  assert.ok(squat > 0.01, 'the nose rises under acceleration: ' + squat);
  let dive = 0;
  run(rig, s, {}, 2, [], () => (dive = Math.min(dive, euler(s).x)));
  assert.ok(dive < -0.03, 'the nose dives under braking: ' + dive);
  assert.ok(speed(s) < 0.05, 'stops and holds');
  assert.ok(Math.abs(euler(s).x) < 0.02, 'and settles level');
  // Reversing is slower than driving forward.
  run(rig, s, { forward: -1 }, 6);
  assert.ok(toPhysics(s.v[2]) > 0.4 * topSpeed && toPhysics(s.v[2]) < 0.55 * topSpeed);
  rig.dispose();
}

// Tracked steering: pivots on the spot, and asks for less yaw as the speed grows.
{
  const rig = new TankRig(RAPIER),
    s = fresh();
  run(rig, s, {}, 2);
  run(rig, s, { turn: 1 }, 3);
  assert.ok(s.omega[1] > 0.8 && s.omega[1] < profile.turn * 1.05, 'pivot rate ' + s.omega[1]);
  assert.ok(Math.hypot(toPhysics(s.p[0]), toPhysics(s.p[2])) < 0.6, 'pivots in place');
  run(rig, s, { turn: -1 }, 3);
  assert.ok(s.omega[1] < -0.8, 'right is the other way: ' + s.omega[1]);
  const fast = new TankRig(RAPIER),
    f = fresh();
  run(fast, f, { forward: 1 }, 6);
  let worst = 1;
  run(fast, f, { forward: 1, turn: 1 }, 5, [], () => {
    worst = Math.min(
      worst,
      new T.Vector3(0, 1, 0).applyQuaternion(new T.Quaternion().fromArray(f.q)).y,
    );
  });
  const lateral = Math.abs(f.omega[1]) * speed(f);
  assert.ok(f.omega[1] > 0.2 && f.omega[1] < 0.8, 'less yaw at speed: ' + f.omega[1]);
  assert.ok(lateral < 0.5 * GRAVITY, 'lateral ' + lateral);
  assert.ok(worst > 0.97, 'no rollover');
  // The same yaw command turns left going backwards too (the former arcade behaviour).
  const back = new TankRig(RAPIER),
    b = fresh();
  run(back, b, { forward: -0.6, turn: 1 }, 3);
  assert.ok(b.omega[1] > 0.1, 'left stays left in reverse: ' + b.omega[1]);
  [rig, fast, back].forEach((r) => r.dispose());
}

// A wall stops it; a step the size of two wheels is climbed, a higher one is not.
{
  const wall = box(-10, 0, -21, 10, 3, -20),
    rig = new TankRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 8, [wall]);
  assert.ok(toPhysics(s.p[2]) > -20 && toPhysics(s.p[2]) < -18, 'stopped at the wall');
  assert.ok(s.hp === 100 && s.v.every((x) => Math.abs(toPhysics(x)) < 0.4), 'no rebound');
  rig.dispose();
  const climb = (height) => {
    const r = new TankRig(RAPIER),
      st = fresh();
    run(r, st, { forward: 1 }, 10, [box(-5, 0, -30, 5, height, -4)]);
    r.dispose();
    return toPhysics(st.p[2]) < -5;
  };
  assert.ok(climb(0.08), 'climbs a step of 8 cm');
  assert.ok(climb(0.18), 'climbs a step of 18 cm (about two wheel radii)');
  assert.ok(!climb(0.4), 'a 40 cm step is a wall');
}

// The game may move the vehicle: the rig follows its state; the springs lift the
// compression off the wheels in the air.
{
  const rig = new TankRig(RAPIER),
    s = fresh();
  run(rig, s, { forward: 1 }, 2);
  s.p = [toWorld(30), 0.8 * ACTOR_UNIT, toWorld(-30)];
  s.v = [0, 0, 0];
  run(rig, s, {}, 1);
  assert.ok(Math.abs(toPhysics(s.p[0]) - 30) < 0.1 && Math.abs(toPhysics(s.p[2]) + 30) < 0.1);
  s.p = [0, 0.8 * ACTOR_UNIT + 5, 0];
  rig.step(s, {}, [], DT, profile);
  assert.ok(
    rig.wheelCompression.every((c) => c === 0),
    'wheels hang in the air',
  );
  assert.equal(s.landed, false);
  rig.dispose();
}

// Falling off a desk kills as before, a small step does not.
{
  const drop = (height) => {
    const top = height,
      solid = box(-10, 0, -40, 10, toPhysics(top), 10),
      rig = new TankRig(RAPIER),
      s = fresh(0, 0, top);
    run(rig, s, { forward: 1 }, 24, [solid]);
    rig.dispose();
    return s;
  };
  assert.equal(drop(0.75).hp, 0, 'desk');
  assert.equal(drop(0.004).hp, 100, '4 mm step');
}

console.log('tank physics ok: scale, mesh running gear, springs, tracks, steps, falls');
