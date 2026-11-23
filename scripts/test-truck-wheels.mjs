// The anti-air truck's wheels: parts of the rig placed where the model draws them, the two
// front ones steered by the angle the driver asks for (at a standstill too, and shared with the
// other players), the four rear ones and the trailer's fixed, all of them spinning.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { createGraphics } from '../src/graphics.js';
import { ackermannAngle, animateDrivenWheels, animateRollingWheels } from '../src/castor-wheels.ts';
import { wheelSteering } from '../src/castor-physics.ts';
import { MODEL_UNIT } from '../src/physics-world.ts';
import { MODEL_DATA } from '../src/meshy-flaktruck-data.ts';
import {
  PIVOT_MODEL_Z,
  PIVOT_Z,
  TRACTOR_WHEELS,
  TRAILER_WHEELS,
  WHEELBASE,
  WHEELBASE_MODEL,
  WHEEL_MODEL_RADIUS,
} from '../src/truck-physics.ts';

const scene = new T.Scene();
const truck = createGraphics(T, scene).makeFlakTruck('#8eb7c6');
const { truckWheels, trailerWheels, trailer } = truck.userData;
assert.equal(truckWheels.length, 6);
assert.equal(trailerWheels.length, 4);
for (const wheel of [...truckWheels, ...trailerWheels])
  assert.ok(
    wheel.children.some((c) => c.isMesh),
    'a wheel is a node with its mesh',
  );
assert.ok(
  trailerWheels.every((w) => w.parent === trailer),
  'the trailer carries its wheels',
);
assert.ok(truckWheels.every((w) => w.parent === truck));

// Where the model draws them: the trailer's wheels are behind the hitch, between its two ends,
// and touch the same ground as the tractor's (the lowest point of each, in the vehicle's frame).
truck.updateMatrixWorld(true);
const lowest = (wheel) => new T.Box3().setFromObject(wheel).min.y;
const ground = Math.min(...truckWheels.map(lowest));
assert.ok(Math.abs(ground + 0.8) < 0.01, 'the tractor wheels reach the ground: ' + ground);
for (const wheel of trailerWheels) {
  assert.ok(Math.abs(lowest(wheel) - ground) < 0.01, 'the trailer wheels reach the same ground');
  const world = wheel.getWorldPosition(new T.Vector3());
  assert.ok(world.z > 2.4 && world.z < 3.5, 'behind the hitch, under the trailer: ' + world.z);
}
// The wheels the physics reads are the nodes drawn: same positions in the vehicle's frame.
TRACTOR_WHEELS.forEach((w, i) => {
  const world = truckWheels[i].getWorldPosition(new T.Vector3());
  assert.ok(
    Math.abs(world.x - w.x / MODEL_UNIT) < 1e-9 && Math.abs(world.z - w.z / MODEL_UNIT) < 1e-9,
  );
});
TRAILER_WHEELS.forEach((w, i) => {
  const hitch = MODEL_DATA.rig.find((n) => n.name === 'trailer').pivot;
  const world = trailerWheels[i].getWorldPosition(new T.Vector3());
  assert.ok(Math.abs(world.z - (w.z / MODEL_UNIT + hitch[2])) < 1e-9, 'trailer wheel ' + i);
});

// The geometry is the physics'.
for (const delta of [-0.4, -0.1, 0.05, 0.3, 0.5])
  TRACTOR_WHEELS.forEach((w) =>
    assert.ok(
      Math.abs(
        ackermannAngle(
          delta,
          { x: w.x / MODEL_UNIT, z: w.z / MODEL_UNIT },
          PIVOT_MODEL_Z,
          WHEELBASE_MODEL,
        ) - wheelSteering(delta, w, PIVOT_Z, WHEELBASE),
      ) < 1e-9,
    ),
  );

const options = {
  scale: MODEL_UNIT,
  pivotZ: PIVOT_MODEL_Z,
  wheelbase: WHEELBASE_MODEL,
  radius: WHEEL_MODEL_RADIUS,
};
const dt = 1 / 60;
const settle = (motion, frames = 40) => {
  for (let i = 0; i < frames; i++) animateDrivenWheels(truckWheels, motion, options, dt);
};

// At rest with the wheel straight: nothing moves, however small the noise of the yaw rate.
settle({ steer: 0, forwardSpeed: 0, yawRate: 0 }, 5);
for (let i = 0; i < 100; i++)
  animateDrivenWheels(truckWheels, { steer: 0, forwardSpeed: 1e-4, yawRate: 3e-4 }, options, dt);
for (const wheel of truckWheels) assert.ok(Math.abs(wheel.rotation.y) < 1e-9, 'no jitter at rest');

// At a standstill the driver can still turn the wheels: the front ones only, the inner (left)
// wheel more than the outer; the four rear ones stay straight.
settle({ steer: 0.4, forwardSpeed: 0, yawRate: 0 });
const [frontLeft, frontRight, ...rear] = truckWheels;
assert.ok(frontLeft.rotation.y > frontRight.rotation.y && frontRight.rotation.y > 0.2);
assert.ok(
  Math.abs(frontLeft.rotation.y - wheelSteering(0.4, TRACTOR_WHEELS[0], PIVOT_Z, WHEELBASE)) < 1e-3,
);
assert.ok(
  rear.every((w) => w.rotation.y === 0),
  'the rear axles are fixed',
);
// Turning the wheel the other way, then straight again.
settle({ steer: -0.3, forwardSpeed: 0, yawRate: 0 });
assert.ok(frontLeft.rotation.y < 0 && frontRight.rotation.y < 0);
settle({ steer: 0, forwardSpeed: 0, yawRate: 0 });
assert.ok(Math.abs(frontLeft.rotation.y) < 1e-3);
// The steering eases: one frame moves it towards the target, not all the way.
animateDrivenWheels(truckWheels, { steer: 0.5, forwardSpeed: 0, yawRate: 0 }, options, dt);
const target = wheelSteering(0.5, TRACTOR_WHEELS[0], PIVOT_Z, WHEELBASE);
assert.ok(frontLeft.rotation.y > 0.2 * target && frontLeft.rotation.y < 0.9 * target);

// Spin: every wheel rolls forward with the ground speed (v / R), backwards in reverse; none
// without speed.
for (const wheel of truckWheels) wheel.rotation.x = 0;
settle({ steer: 0, forwardSpeed: 0, yawRate: 0 }, 10);
assert.ok(
  truckWheels.every((w) => w.rotation.x === 0),
  'no spin at a standstill',
);
settle({ steer: 0, forwardSpeed: 5, yawRate: 0 }, 10);
for (const wheel of truckWheels) {
  assert.ok(
    Math.abs(wheel.rotation.x + (5 / (WHEEL_MODEL_RADIUS * MODEL_UNIT)) * dt * 10) < 1e-9,
    'spin',
  );
  wheel.rotation.x = 0;
}
settle({ steer: 0, forwardSpeed: -3, yawRate: 0 }, 10);
assert.ok(
  truckWheels.every((w) => w.rotation.x > 0),
  'backwards',
);
// A trailer wheel only rolls.
animateRollingWheels(trailerWheels, 5, { scale: MODEL_UNIT, radius: 0.35 }, dt);
assert.ok(trailerWheels.every((w) => w.rotation.x < 0 && w.rotation.y === 0));
console.log('truck wheels ok: placement, driver steering at rest, fixed rear axles, spin');
