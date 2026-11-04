import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { VEHICLES } from '../src/fleet.js';
const graphics = createGraphics(T, new T.Scene());
const a = graphics.makeHelicopter('#7b8155');
const b = graphics.makeHelicopter('#7b8155');
assert.ok(Math.abs(new T.Box3().setFromObject(a).min.y + 1.1) < 1e-5, 'parked wheel contact');
let triangles = 0,
  draws = 0;
const meshes = [];
a.traverse((o) => {
  if (!o.isMesh) return;
  meshes.push(o);
  draws++;
  triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
  for (const attribute of Object.values(o.geometry.attributes))
    assert.ok(attribute.array.every(Number.isFinite));
});
assert.ok(triangles <= 3650);
assert.ok(draws <= 8);
const bMeshes = [];
b.traverse((o) => {
  if (o.isMesh) bMeshes.push(o);
});
assert.equal(meshes[0].geometry, bMeshes[0].geometry, 'shared immutable geometry');
for (const [name, axis] of [
  ['rotor', 'y'],
  ['tailRotor', 'x'],
]) {
  const rotor = a.userData[name];
  assert.ok(rotor.children.length, name);
  const blade = rotor.children[0];
  const v = new T.Vector3().fromBufferAttribute(blade.geometry.attributes.position, 0);
  a.updateMatrixWorld(true);
  const before = blade.localToWorld(v.clone());
  rotor.rotation[axis] += 0.7;
  a.updateMatrixWorld(true);
  assert.ok(blade.localToWorld(v.clone()).distanceTo(before) > 0.01, name + ' rotates');
  assert.equal(b.userData[name].rotation[axis], 0, 'independent rotors');
}
const rotorBounds = new T.Box3().setFromObject(b.userData.rotor);
assert.ok(rotorBounds.max.z < 3.8, 'main rotor excludes tail assembly');
const tailBounds = new T.Box3().setFromObject(b.userData.tailRotor);
assert.ok(tailBounds.getSize(new T.Vector3()).x < 0.22, 'tail rotor excludes thick fin');
assert.ok(tailBounds.min.z > 4, 'tail rotor stays at tail');
const mount = b.userData.turrets[0];
const { pitch, muzzle } = mount.userData;
b.updateMatrixWorld(true);
assert.ok(
  muzzle.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(0.15, -0.65, -3.2)) < 1e-6,
);
const tip = muzzle.getWorldPosition(new T.Vector3());
mount.rotation.y = 0.3;
pitch.rotation.x = -0.2;
b.updateMatrixWorld(true);
assert.ok(
  muzzle.getWorldPosition(new T.Vector3()).distanceTo(tip) > 0.1,
  'muzzle follows articulated barrel',
);
paintVehicle(T, a, 7, '#7b8155');
assert.ok(meshes.some((o) => o.material === a.userData.paint));
b.scale.setScalar(ACTOR_UNIT);
b.position.y = VEHICLES.helicopter.gear;
assert.ok(Math.abs(new T.Box3().setFromObject(b).min.y) < 1e-5);
console.log(
  `PASS: H2 Meshy ${triangles} triangles, ${draws} meshes, wheel contact, shared geometry, two rotors, copilot barrel and livery.`,
);
