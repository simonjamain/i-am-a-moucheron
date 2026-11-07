// Issue #98: Castor wheels roll with the vehicle (direction, proportional speed,
// stop, reverse), the front axle steers, a pivot spins sides in opposition, and
// the truck reaches about twice its first top speed with a fading acceleration.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  animateCastorWheels,
  CASTOR_MAX_STEER,
  CASTOR_WHEEL_RADIUS,
  trackGroundMotion,
  wheelPose,
} from '../src/castor-wheels.js';
import { createGraphics } from '../src/graphics.js';
import { VEHICLES } from '../src/fleet.js';
import { stepTank } from '../src/tank.js';
import { ACTOR_UNIT, MAP } from '../src/scale.js';

const options = { scale: ACTOR_UNIT, turnRate: VEHICLES.castor.turn, frontZ: -2.05 };
const left = { x: -1.01, z: 0.55 },
  right = { x: 1.01, z: 0.55 },
  front = { x: -1.01, z: -2.05 };
const dt = 1 / 60;
const forward = MAP.metres(10);

// Rolling: forward motion spins negatively around +x, reverse the other way,
// exactly ground speed / radius, and nothing when stopped.
const go = wheelPose(left, { forwardSpeed: forward, yawRate: 0 }, options, dt);
assert.ok(go.spin < 0, 'forward rolls forward');
assert.ok(Math.abs(go.spin + (forward / (CASTOR_WHEEL_RADIUS * ACTOR_UNIT)) * dt) < 1e-12);
const back = wheelPose(left, { forwardSpeed: -forward, yawRate: 0 }, options, dt);
assert.ok(Math.abs(back.spin + go.spin) < 1e-15, 'reverse spins backwards');
assert.equal(wheelPose(left, { forwardSpeed: 0, yawRate: 0 }, options, dt).spin + 0, 0);
const slow = wheelPose(left, { forwardSpeed: forward / 4, yawRate: 0 }, options, dt);
assert.ok(Math.abs(slow.spin * 4 - go.spin) < 1e-15, 'spin proportional to speed');

// Pivot on the spot (left turn): opposite spins left/right, front wheels steer left.
const pivot = { forwardSpeed: 0, yawRate: VEHICLES.castor.turn };
const l = wheelPose(left, pivot, options, dt),
  r = wheelPose(right, pivot, options, dt),
  f = wheelPose(front, pivot, options, dt);
assert.ok(l.spin > 0 && r.spin < 0 && Math.abs(l.spin + r.spin) < 1e-15, 'pivot: opposite sides');
assert.equal(f.steer, CASTOR_MAX_STEER, 'pivot: front wheels steered');
assert.equal(l.steer, 0, 'middle and rear axles do not steer');
assert.equal(wheelPose(front, { forwardSpeed: forward, yawRate: 0 }, options, dt).steer, 0);
assert.equal(
  wheelPose(front, { forwardSpeed: forward, yawRate: -VEHICLES.castor.turn / 2 }, options, dt)
    .steer,
  -CASTOR_MAX_STEER / 2,
  'steering follows turn rate and direction',
);
// Driving through a left curve: outer (right) wheels roll faster than inner ones.
const curve = { forwardSpeed: forward, yawRate: VEHICLES.castor.turn / 2 };
assert.ok(wheelPose(right, curve, options, dt).spin < wheelPose(left, curve, options, dt).spin);

// Yaw rate measured from displayed headings, robust to the ±π wrap and stops.
const memory = {};
trackGroundMotion(memory, Math.PI - 0.01, 0, dt);
let tracked;
for (let i = 1; i <= 60; i++)
  tracked = trackGroundMotion(memory, Math.PI - 0.01 + i * 0.5 * dt, 0, dt);
assert.ok(Math.abs(tracked.yawRate - 0.5) < 0.01, 'yaw rate across the wrap');
for (let i = 0; i < 60; i++) tracked = trackGroundMotion(memory, memory.yaw, 0, dt);
assert.equal(tracked.yawRate, 0, 'stops settle to zero');

// Real model: six axles animated, front pair steered with a Y-then-X rotation order.
const model = createGraphics(T, new T.Scene()).makeCastor();
animateCastorWheels(model.userData.wheels, pivot, options, 0.5);
const steered = model.userData.wheels.filter((w) => w.rotation.y !== 0);
assert.equal(steered.length, 2);
assert.ok(steered.every((w) => w.position.z < -1 && w.rotation.order === 'YXZ'));
const spins = model.userData.wheels.map((w) => Math.sign(w.rotation.x) * Math.sign(w.position.x));
assert.ok(
  spins.every((s) => s === spins[0]),
  'each side spins the same way, sides opposite',
);

// Driving: about twice the former 26 top speed; first-order approach gives a
// strong start that fades near the limit.
assert.equal(VEHICLES.castor.maxSpeed, 52);
const state = { p: [0, 0.01, 0], v: [0, 0, 0], q: [0, 0, 0, 1] };
const speeds = [];
for (let i = 0; i < 180; i++) {
  stepTank(T, state, { forward: 1, turn: 0 }, [], dt, VEHICLES.castor);
  speeds.push(Math.hypot(...state.v));
}
const accel = speeds.map((v, i) => v - (speeds[i - 1] ?? 0));
assert.ok(accel[1] > accel[30] && accel[30] > accel[90], 'acceleration decreases');
assert.ok(speeds.at(-1) > MAP.metres(52) * 0.99 && speeds.at(-1) <= MAP.metres(52) + 1e-12);
assert.ok(speeds[15] > MAP.metres(26), 'passes the old top speed within a quarter second');
console.log(
  'Castor wheels: signed rolling, reverse, stop, pivot opposition, front steering, 2× speed.',
);
