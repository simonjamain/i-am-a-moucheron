import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createOffice } from '../src/office.js';
import { createGraphics } from '../src/graphics.js';
import { aircraftPose } from '../src/base.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
// Scene geometry can be checked without a GPU or DOM-backed text textures.
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const office = createOffice(T, scene, { ...graphics, textLabel: () => new T.Group() });
scene.updateMatrixWorld(true);
assert.equal(office.fanGroup, undefined, 'fan geometry is removed');
for (let i = 0; i < 12; i++) {
  const parked = aircraftPose(i),
    departure = aircraftPose(i, true),
    q = new T.Quaternion().fromArray(departure.q),
    direction = new T.Vector3(0, 0, -1).applyQuaternion(q);
  assert.ok(direction.z > 0.99, 'nose faces the open front of the desk');
  assert.ok(
    direction.dot(new T.Vector3().fromArray(departure.v)) > MAP.metres(24.99),
    'velocity follows the nose',
  );
  const plane = graphics.makePlane('#ffffff');
  plane.scale.setScalar(ACTOR_UNIT);
  plane.position.fromArray(parked.p);
  plane.quaternion.fromArray(parked.q);
  plane.updateMatrixWorld(true);
  assert.ok(
    Math.abs(new T.Box3().setFromObject(plane).min.y - OFFICE_LAYOUT.base.deckY) < 1e-5,
    'landing gear touches the deck',
  );
  const origin = new T.Vector3().fromArray(departure.p),
    ray = new T.Ray(origin, direction);
  for (const collider of office.colliders) {
    const hit = ray.intersectBox(collider, new T.Vector3());
    assert.ok(
      !hit || origin.distanceTo(hit) > 15 * ACTOR_UNIT,
      'initial departure corridor is clear of furniture',
    );
  }
  scene.remove(plane);
}
// Every extracted browser module must be included in the built Worker.
const { default: worker } = await import('../worker/index.js');
for (const name of ['office', 'graphics', 'renderer', 'layout'])
  assert.equal(
    (await worker.fetch(new Request('https://test.local/' + name + '.js'), {})).status,
    200,
  );
console.log(
  'PASS: fan removed, parked landing gear, clear outward departure, aligned nose/velocity and packaged scene modules',
);
