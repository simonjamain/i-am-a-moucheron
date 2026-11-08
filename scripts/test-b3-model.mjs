import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';
import { b3Attribute } from '../src/b3-model.js';
import { B3_DATA } from '../src/meshy-b3-data.js';
import { aimGun, gunnerView } from '../src/sortie.js';
import { ACTOR_UNIT } from '../src/scale.js';
import { VEHICLES } from '../src/fleet.js';
const graphics = createGraphics(T, new T.Scene());
const a = graphics.makeBomber(),
  b = graphics.makeBomber();
assert.equal(a.userData.turrets.length, 3);
assert.equal(a.userData.props.length, 2);
let triangles = 0;
const meshes = [];
a.traverse((o) => {
  if (!o.isMesh) return;
  meshes.push(o);
  const g = o.geometry;
  triangles += (g.index?.count || g.attributes.position.count) / 3;
  for (const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
});
assert.ok(triangles < 31000);
assert.equal(meshes[0].geometry, b.children[0].children[0].geometry);
const material = meshes[0].material;
assert.ok(material.map);
assert.equal(material.map.colorSpace, T.SRGBColorSpace);
assert.equal(material.map.flipY, false);
assert.ok(B3_DATA.texture.startsWith('data:image/jpeg;base64,/9j/'));
for (const part of B3_DATA.parts)
  assert.equal(b3Attribute(part.uv).length / 2, b3Attribute(part.positions).length / 3);
paintVehicle(T, a, 7, '#ffffff');
assert.equal(meshes[0].material, material, 'original atlas remains untouched');
// Issue #106: no floating colour marker, whatever the vehicle sequence.
assert.equal(a.userData.identification, undefined);
paintVehicle(T, a, 8, '#ffffff');
assert.equal(a.userData.identification, undefined);
assert.equal(meshes[0].material, material);
const ventral = a.userData.turrets[2];
assert.ok(ventral.position.y < 0);
const direction = new T.Vector3(0.3, -0.9, -0.3).normalize();
aimGun(T, ventral, direction, new T.Quaternion());
a.updateMatrixWorld(true);
const origin = ventral.getWorldPosition(new T.Vector3());
const tip = ventral.userData.muzzle.getWorldPosition(new T.Vector3());
assert.ok(tip.clone().sub(origin).normalize().dot(direction) > 0.999);
const view = gunnerView(T, ventral, direction, new T.Vector3(0, 1, 0), true);
assert.ok(view.eye.y < origin.y, 'ventral camera remains below hull');
assert.notEqual(a.userData.turrets[2].rotation.y, b.userData.turrets[2].rotation.y);
b.scale.setScalar(ACTOR_UNIT);
b.position.y = VEHICLES.bomber.gear;
assert.ok(Math.abs(new T.Box3().setFromObject(b).min.y) < 1e-5, 'wheel contact');
console.log(
  `PASS B3: ${triangles} triangles, actual UV atlas, shared geometry, independent turret, no marker, ventral camera, wheel contact.`,
);
