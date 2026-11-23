// The medium tank's running gear: wheels, idlers and sprockets are rig nodes that turn with
// the speed of their own track; the belts are meshes of their own. The tank is drawn 20 %
// bigger than the other vehicles' unit.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.webgpu.min.js';
import { createGraphics } from '../src/graphics.js';
import { animateTrackedWheels } from '../src/castor-wheels.ts';
import { ACTOR_UNIT } from '../src/scale.ts';
import { VEHICLES, vehicleScale, vehicleUnit } from '../src/fleet.ts';

const tank = createGraphics(T, new T.Scene()).makeTank('#8eb7c6');
const { runningGear, tracks } = tank.userData;
assert.equal(runningGear.length, 12, 'eight road wheels, two idlers, two sprockets');
assert.equal(tracks.length, 2);
for (const node of [...runningGear, ...tracks])
  assert.ok(
    node.children.some((c) => c.isMesh),
    'a node with its mesh: ' + node.name,
  );
for (const wheel of runningGear) {
  assert.ok(
    wheel.userData.radius > 0.2 && wheel.userData.radius < 0.31,
    'radius ' + wheel.userData.radius,
  );
  assert.equal(wheel.parent, tank);
}

// Bigger: the model is drawn at 1.2 times the unit, and rests on its tracks at the gear height.
assert.equal(vehicleScale('tank'), 1.2);
tank.scale.setScalar(vehicleUnit('tank'));
tank.position.y = VEHICLES.tank.gear;
tank.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(tank);
assert.ok(Math.abs(box.min.y) < 1e-5, 'the belts touch the ground: ' + box.min.y);
assert.ok(Math.abs(vehicleUnit('tank') - 1.2 * ACTOR_UNIT) < 1e-15);
const bigger = new T.Box3().setFromObject(tank).getSize(new T.Vector3());
tank.scale.setScalar(ACTOR_UNIT);
const plain = new T.Box3().setFromObject(tank).getSize(new T.Vector3());
assert.ok(Math.abs(bigger.z / plain.z - 1.2) < 1e-6, 'a fifth bigger');

// Spin: forward, every wheel rolls forward (negative spin about x) at v / radius.
const unit = vehicleUnit('tank'),
  dt = 1 / 60;
animateTrackedWheels(runningGear, { forwardSpeed: 0.02, yawRate: 0 }, unit, dt);
for (const wheel of runningGear) {
  const expected = -(0.02 / (wheel.userData.radius * unit)) * dt;
  assert.ok(Math.abs(wheel.rotation.x - expected) < 1e-9, 'spin of ' + wheel.name);
  wheel.rotation.x = 0;
}
// A pivot on the spot: the two tracks run in opposite directions.
animateTrackedWheels(runningGear, { forwardSpeed: 0, yawRate: 1 }, unit, dt);
for (const wheel of runningGear)
  assert.ok(wheel.position.x > 0 ? wheel.rotation.x < 0 : wheel.rotation.x > 0, 'opposite tracks');
// A left turn (positive yaw) while driving: the right track (outer) runs faster.
for (const wheel of runningGear) wheel.rotation.x = 0;
animateTrackedWheels(runningGear, { forwardSpeed: 0.02, yawRate: 0.5 }, unit, dt);
const turn = (side) =>
  runningGear
    .filter((w) => Math.sign(w.position.x) === side)
    .map((w) => Math.abs(w.rotation.x) * w.userData.radius);
assert.ok(Math.min(...turn(1)) > Math.max(...turn(-1)), 'the outer track is faster');
// At a standstill nothing spins.
for (const wheel of runningGear) wheel.rotation.x = 0;
animateTrackedWheels(runningGear, { forwardSpeed: 0, yawRate: 0 }, unit, dt);
assert.ok(runningGear.every((w) => w.rotation.x === 0));
console.log('tank wheels ok: rig nodes, 20 % bigger, spin with the speed of each track');
