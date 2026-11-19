// The anti-air truck's wheels turn and steer: each wheel rolls along the velocity of its own
// contact point, so the angles match the physics' Ackermann geometry and need no network data.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import {
  animateRollingWheels,
  animateSteeredWheels,
  steeredWheelPose,
} from '../src/castor-wheels.ts';
import { wheelSteering } from '../src/castor-physics.ts';
import { MODEL_UNIT } from '../src/physics-world.ts';
import {
  PIVOT_MODEL_Z,
  PIVOT_Z,
  TRACTOR_WHEELS,
  WHEELBASE,
  WHEEL_MODEL_RADIUS,
} from '../src/truck-physics.ts';

const scene = new T.Scene();
const truck = createGraphics(T, scene).makeFlakTruck('#8eb7c6');
assert.equal(truck.userData.truckWheels.length, 6);
assert.equal(truck.userData.trailerWheels.length, 4);
for (const wheel of [...truck.userData.truckWheels, ...truck.userData.trailerWheels]) {
  assert.ok(wheel, 'wheel node');
  assert.ok(
    wheel.children.some((c) => c.isMesh),
    'with its mesh',
  );
}
// Wheels are nodes of the rig: the trailer's ride on the trailer, which yaws and pitches.
assert.ok(truck.userData.trailerWheels.every((w) => w.parent === truck.userData.trailer));
assert.ok(truck.userData.truckWheels.every((w) => w.parent === truck));

const scale = MODEL_UNIT; // metres per model unit
const options = { scale, pivotZ: PIVOT_MODEL_Z, radius: WHEEL_MODEL_RADIUS };
const wheels = TRACTOR_WHEELS.map((w) => ({ x: w.x / MODEL_UNIT, z: w.z / MODEL_UNIT }));
const dt = 1 / 60;

// Standing still: nothing turns, nothing steers.
for (const w of wheels)
  assert.deepEqual(steeredWheelPose(w, { forwardSpeed: 0, yawRate: 0 }, options, dt), {
    spin: 0,
    steer: 0,
  });
// Straight ahead: all wheels roll forward (negative spin), none steers; the spin is v / R.
for (const w of wheels) {
  const pose = steeredWheelPose(w, { forwardSpeed: 5, yawRate: 0 }, options, dt);
  assert.equal(pose.steer, 0);
  assert.ok(Math.abs(pose.spin + (5 / (WHEEL_MODEL_RADIUS * scale)) * dt) < 1e-9, 'spin');
}
// The same Ackermann geometry as the physics: for a few front-wheel angles, the angle of
// each wheel equals wheelSteering() when the yaw rate is the bicycle model's.
const speed = 4;
for (const delta of [-0.3, -0.1, 0.05, 0.2, 0.45]) {
  const yawRate = (speed * Math.tan(delta)) / WHEELBASE;
  TRACTOR_WHEELS.forEach((w, i) => {
    const expected = wheelSteering(delta, w, PIVOT_Z, WHEELBASE),
      pose = steeredWheelPose(wheels[i], { forwardSpeed: speed, yawRate }, options, dt);
    assert.ok(
      Math.abs(pose.steer - expected) < 0.02,
      `wheel ${i} at ${delta}: ${pose.steer} vs ${expected}`,
    );
  });
}
// A left turn: the front wheels point left, the inner (left) one more than the outer; the
// rear tandem's wheels steer a little the other way around the pivot.
{
  const left = { forwardSpeed: 4, yawRate: 0.8 };
  const [frontLeft, frontRight, , , rearLeft] = wheels.map((w) =>
    steeredWheelPose(w, left, options, dt),
  );
  assert.ok(frontLeft.steer > frontRight.steer && frontRight.steer > 0.1, 'front wheels turn left');
  assert.ok(rearLeft.steer < 0, 'the rear axle steers the other way');
}
// Reversing: the wheels roll backwards (positive spin) and stay within ±90°.
for (const yawRate of [-0.5, 0, 0.5])
  for (const w of wheels) {
    const pose = steeredWheelPose(w, { forwardSpeed: -3, yawRate }, options, dt);
    assert.ok(pose.spin > 0 && Math.abs(pose.steer) <= Math.PI / 2 + 1e-9, 'backwards');
  }
// Animated nodes: the spin accumulates, the steering is set; a trailer wheel only rolls.
animateSteeredWheels(truck.userData.truckWheels, { forwardSpeed: 5, yawRate: 0.6 }, options, dt);
assert.ok(
  truck.userData.truckWheels[0].rotation.y > 0 && truck.userData.truckWheels[0].rotation.x < 0,
);
animateRollingWheels(truck.userData.trailerWheels, 5, { scale, radius: 0.35 }, dt);
assert.ok(truck.userData.trailerWheels.every((w) => w.rotation.x < 0 && w.rotation.y === 0));
console.log(
  'truck wheels ok: Ackermann steering from speed and yaw rate, spin, reverse, rig nodes',
);
