import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA as BODY } from '../src/meshy-castor-body-data.js';
import { MODEL_DATA as TURRET } from '../src/meshy-castor-turret-data.js';
import { MODEL_DATA as WHEEL } from '../src/meshy-castor-wheel-data.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';

for (const [name, data] of [['body', BODY], ['turret', TURRET], ['wheel', WHEEL]]) {
  assert.match(data.sourceTask, /^01a1afc9-/);
  assert.match(data.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(data.texture, /^data:image\/jpeg;base64,\/9j\//);
  assert.ok(data.triangles >= 500 && data.triangles <= 300000);
  assert.ok(data.parts.length > 0);
  assert.ok(data.parts.every((p) => p.part === name));
  let count = 0;
  for (const p of data.parts) {
    const vertices = Uint8Array.from(atob(p.positions), (c) => c.charCodeAt(0));
    const uvs = Uint8Array.from(atob(p.uv), (c) => c.charCodeAt(0));
    const indices = Uint8Array.from(atob(p.indices), (c) => c.charCodeAt(0));
    assert.equal(uvs.byteLength, (vertices.byteLength / 6) * 4);
    assert.equal(indices.byteLength % 6, 0);
    assert.ok(new Uint16Array(indices.buffer).every((i) => i < vertices.byteLength / 6));
    count += indices.byteLength / 6;
  }
  assert.equal(count, data.triangles, name + ' preserves all source triangles');
}
const graphics = createGraphics(T, new T.Scene());
const first = graphics.makeCastor();
const second = graphics.makeCastor();
const parts = (g) => {
  const meshes = [];
  g.traverse((o) => { if (o.name.startsWith('meshy-castor-')) meshes.push(o); });
  return meshes;
};
const a = parts(first), b = parts(second);
assert.ok(a.length >= 8, 'separate mesh instances for the six wheels, turret and hull');
assert.equal(a.length, b.length);
for (let i = 0; i < a.length; i++) {
  assert.equal(a[i].geometry, b[i].geometry);
  assert.equal(a[i].material, b[i].material);
  assert.ok(a[i].material.map);
  assert.equal(a[i].material.map.colorSpace, T.SRGBColorSpace);
  assert.equal(a[i].material.map.flipY, false);
}
// No second row of sculpted wheels in the source hull and no detached
// giant wheels outside the body: pivots are aligned to the actual Meshy axles.
const maskedHull = a.filter((o) => o.name === 'meshy-castor-body');
const hidden = maskedHull.reduce(
  (sum, o) => sum + o.geometry.userData.embeddedWheelTrianglesRemoved,
  0,
);
assert.ok(hidden > 9000 && hidden < 16000, 'six embedded wheels are hidden');
const box = new T.Box3().setFromObject(first);
assert.ok(box.getSize(new T.Vector3()).x < 2.8, 'wheels stay under truck');
for (const wheel of first.userData.wheels) {
  assert.ok(Math.abs(wheel.position.x) < 1.25, 'wheel aligned with hull width');
  assert.ok(wheel.position.y > -0.4 && wheel.position.y < -0.1);
  assert.ok(wheel.children[0].scale.x < 0.8, 'wheel scaled to original radius');
}
assert.equal(first.userData.wheels.length, 6);
const ownWheel = first.userData.wheels[0];
ownWheel.rotation.x = 1;
assert.equal(second.userData.wheels[0].rotation.x, 0);
const gun = first.userData.turrets[0];
gun.rotation.y = 0.4;
assert.equal(second.userData.turrets[0].rotation.y, 0);
assert.ok(gun.userData.muzzle.parent === gun.userData.pitch);
const originals = a.map((x) => x.material);
paintVehicle(T, first, 7, '#647a4d');
assert.ok(first.userData.identification);
assert.ok(first.userData.identificationHeight > 2);
a.forEach((o, i) => assert.equal(o.material, originals[i], 'no random body recoloring'));
console.log('Castor Meshy: real UV textures, separate articulated components, shared resources OK');
