import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createOffice } from '../src/office.js';
import { createGraphics } from '../src/graphics.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import {
  officeFogCeiling,
  officeFogOpacity,
  fogOpticalDepth,
  installOfficeFog,
} from '../src/office-fog.js';
import { stepHelicopter } from '../src/helicopter.js';
import { stepVacantAircraft } from '../src/vacant-flight.js';
import { VEHICLES, vehiclePad } from '../src/fleet.js';

const scene = new T.Scene();
const office = createOffice(T, scene, createGraphics(T, scene));
const colliderCount = office.colliders.length;
const backdrop = officeFogCeiling(T, OFFICE_LAYOUT.bounds);
scene.add(backdrop);
scene.updateMatrixWorld(true);
const origin = new T.Vector3(0, 0.95, 0);
// These rays go through the cloud layer on each side, rather than escaping
// through the open south to the clear, unfogged scene background.
for (const [x, z] of [
  [0, -3.6],
  [4.2, 0],
  [0, 3.6],
  [-4.2, 0],
]) {
  const direction = new T.Vector3(x, 2.65, z).sub(origin).normalize();
  const hit = new T.Raycaster(origin, direction).intersectObject(backdrop)[0];
  assert.ok(hit, `cloud background must cover direction ${x},${z}`);
  assert.ok(fogOpticalDepth(origin.y, hit.point.y, hit.distance) > 2);
}
assert.equal(backdrop.material.fog, true);
assert.equal(backdrop.userData.projectileSolid, false);
assert.equal(office.colliders.length, colliderCount, 'atmosphere adds no solid surface');
assert.equal(
  new T.Raycaster(origin, new T.Vector3(0, -1, 0)).intersectObject(backdrop).length,
  0,
  'atmosphere has no floor',
);
assert.equal(OFFICE_LAYOUT.bounds.ceiling, 3.95, 'one room metre above the former flight limit');
assert.equal(officeFogOpacity(2), 0, 'layer does not move down');
assert.ok(officeFogOpacity(2.8) > 0.1, 'layer does not move up with the flight limit');
assert.equal(officeFogOpacity(3.8), 0.65, 'haze remains above the former ceiling');
assert.ok(fogOpticalDepth(3.2, 3.2, 1) > 9, 'new flyable space stays inside the clouds');
installOfficeFog(T);
assert.ok(T.ShaderChunk.fog_fragment.includes('float fogStart = 2.2125000;'));
for (const [height, alive] of [
  [3.2, true],
  [3.94, true],
  [3.96, false],
]) {
  for (const type of ['fighter', 'helicopter']) {
    const state = { ...vehiclePad(type), p: [0, height, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };
    if (type === 'helicopter') stepHelicopter(T, state, {}, [], 1 / 120, VEHICLES[type]);
    else stepVacantAircraft(T, state, VEHICLES[type], [], 1 / 120);
    assert.equal(state.hp > 0, alive, `${type} at ${height} m`);
  }
}
console.log(
  'Clouds: four background directions, no solid floor, fixed cloud height and +1 m flight limit',
);
