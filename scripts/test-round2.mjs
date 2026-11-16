import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { wheelPose } from '../src/castor-wheels.js';
import { stepHelicopter } from '../src/helicopter.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';
import { CombatEffects } from '../src/combat.js';
import { makeBiplaneBomber } from '../src/biplane-model.js';
import { aimGun } from '../src/sortie.js';
import { makeH2 } from '../src/h2-model.js';
import { nearestWeaponMuzzle } from '../src/muzzle.js';
import { makeServiceStation } from '../src/station-model.js';
import { fogOpticalDepth, officeFogOpacity } from '../src/office-fog.js';
import { brickLayout, BRICK_PITCH, BRICK_HEIGHT, BRICK_ROW } from '../src/brick-wall.js';
import { groundCommand, newGroundDefense, lengthPrice } from '../src/ground-defense-state.js';
const wheel = { x: -1, z: -2 },
  opts = { scale: 0.003, turnRate: 1, frontZ: -2 };
assert.equal(
  wheelPose(wheel, { forwardSpeed: 0.03, yawRate: 1 }, opts, 0.1).steer,
  wheelPose(wheel, { forwardSpeed: -0.03, yawRate: -1 }, opts, 0.1).steer,
);
assert.ok(wheelPose(wheel, { forwardSpeed: 0, yawRate: 1 }, opts, 0.1).steer > 0, 'pivot retained');
const state = { ...vehiclePad('helicopter'), p: [0, 1, 0], q: [0, 0, 0, 1] };
for (let i = 0; i < 240; i++)
  stepHelicopter(
    T,
    state,
    { direction: [0, 0.3, -Math.sqrt(0.91)] },
    [],
    1 / 120,
    VEHICLES.helicopter,
  );
assert.ok(
  new T.Euler().setFromQuaternion(new T.Quaternion().fromArray(state.q), 'YXZ').x > 0.2,
  'mouse altitude followed',
);
const scene = new T.Scene(),
  bomber = makeBiplaneBomber(T, scene),
  mount = bomber.userData.turrets[0];
const dir = new T.Vector3(0.3, 0.2, 1).normalize();
aimGun(T, mount, dir, bomber.quaternion);
const anchor = mount.userData.muzzle;
assert.equal(nearestWeaponMuzzle(T, bomber, anchor.getWorldPosition(new T.Vector3())), anchor);
const effects = new CombatEffects(T, scene);
effects.muzzle(anchor.getWorldPosition(new T.Vector3()), new T.Vector3(1, 0, 0), anchor);
bomber.position.set(1, 2, 3);
bomber.rotation.y = 0.9;
effects.update(0.01);
const flash = effects.items[0].g;
assert.ok(flash.position.distanceTo(anchor.getWorldPosition(new T.Vector3())) < 1e-9);
assert.ok(
  flash.quaternion.angleTo(anchor.getWorldQuaternion(new T.Quaternion())) < 1e-7,
  'flash follows barrel despite dispersion',
);
const h = makeH2(T, scene);
assert.equal(h.userData.turrets[0].userData.muzzles.length, 2);
const initial = h.userData.gunSpin.rotation.z;
h.userData.animateGun(0.1, true);
assert.notEqual(h.userData.gunSpin.rotation.z, initial);
let speed;
for (let i = 0; i < 240; i++) speed = h.userData.animateGun(1 / 120, false);
assert.ok(speed < 0.001, 'barrels coast to a stop');
const size = new T.Box3().setFromObject(makeServiceStation(T, 'refuel')).getSize(new T.Vector3());
assert.ok(Math.abs(size.x - 12) < 0.001, 'station ×3');
assert.equal(officeFogOpacity(2, 2.95), 0);
assert.ok(officeFogOpacity(2.8, 2.95) > 0.1);
assert.equal(fogOpticalDepth(0, 1.9, 4, 2.95), 0);
assert.ok(fogOpticalDepth(0, 2.95, 3, 2.95) > 2, 'layer seen from below');
assert.ok(fogOpticalDepth(2.8, 2.8, 1, 2.95) > 2, 'haze inside');
const bricks = brickLayout(0.048);
assert.equal(bricks.length, 4);
assert.equal(new Set(bricks.map((b) => b.y)).size, 2);
assert.ok(bricks.every((b) => Math.abs(b.width - (BRICK_PITCH - 0.0002)) < 1e-9));
assert.equal(bricks[2].x - bricks[0].x, 0.012, 'offset ends interlock');
assert.equal(lengthPrice('barricade', 0.048), 0.25);
assert.equal(lengthPrice('sticky', 0.2), 1);
const defense = newGroundDefense();
let result = groundCommand(
  defense,
  { action: 'build', kind: 'barricade', a: [0, 0], b: [0.048, 0] },
  [0, 0],
  10,
);
assert.equal(result.price, 0.25);
result = groundCommand(
  defense,
  { action: 'build', kind: 'barricade', a: [0.048, 0], b: [0.06, 0] },
  [0, 0],
  10,
);
assert.equal(result.price, 0.06, 'partial section joins and bills pro rata');
assert.equal(defense.structures.length, 2);
console.log(
  'Round2: reverse wheels, mouse helicopter, moving muzzle flash, Hind spin, station ×3, spatial fog, LEGO dimensions/join/billing',
);

// A partial stop/resume must be visually identical to a single continuous run.
const { wallVisualRuns } = await import('../src/brick-rules.js');
const resumed = wallVisualRuns([
  { kind: 'barricade', id: 'a', a: [0, 0], b: [0.036, 0], hp: 100 },
  { kind: 'barricade', id: 'b', a: [0.036, 0], b: [0.084, 0], hp: 100 },
]);
assert.equal(resumed.length, 1);
assert.deepEqual(resumed[0].a, [0, 0]);
assert.deepEqual(resumed[0].b, [0.084, 0]);
assert.deepEqual(
  brickLayout(0.084),
  brickLayout(Math.hypot(resumed[0].b[0] - resumed[0].a[0], resumed[0].b[1] - resumed[0].a[1])),
);
assert.equal(
  wallVisualRuns([
    { kind: 'barricade', a: [0, 0], b: [0.048, 0], hp: 0 },
    { kind: 'barricade', a: [0.048, 0], b: [0.096, 0], hp: 100 },
  ]).length,
  1,
  'destroyed sections leave a real gap',
);
