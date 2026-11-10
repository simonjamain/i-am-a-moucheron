import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA } from '../src/meshy-castor-data.js';
import { CASTOR_WHEEL_RADIUS } from '../src/castor-wheels.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';

// One remodelled Meshy source, split into islands by scripts/import-meshy-castor.py.
assert.match(MODEL_DATA.sourceSha256, /^[a-f0-9]{64}$/);
assert.equal(
  MODEL_DATA.sourceSha256,
  'b211b4234f6a2ac443357c7867c9a634288a098f6fd5bfa62e3b4b863e67c466',
);
assert.match(MODEL_DATA.texture, /^data:image\/jpeg;base64,\/9j\//);
assert.deepEqual(
  MODEL_DATA.parts.map((p) => p.part),
  ['body', 'wheel0', 'wheel1', 'wheel2', 'wheel3', 'wheel4', 'wheel5', 'turret', 'gun'],
);
let count = 0;
for (const p of MODEL_DATA.parts) {
  const vertices = Uint8Array.from(atob(p.positions), (c) => c.charCodeAt(0));
  const uvs = Uint8Array.from(atob(p.uv), (c) => c.charCodeAt(0));
  const indices = Uint8Array.from(atob(p.indices), (c) => c.charCodeAt(0));
  assert.equal(uvs.byteLength, (vertices.byteLength / 6) * 4);
  assert.equal(indices.byteLength % 6, 0);
  assert.ok(new Uint16Array(indices.buffer).every((i) => i < vertices.byteLength / 6));
  count += indices.byteLength / 6;
}
assert.equal(count, MODEL_DATA.triangles, 'every source triangle is kept');
assert.equal(MODEL_DATA.triangles, 3700);
assert.ok(Math.abs(MODEL_DATA.wheelRadius - CASTOR_WHEEL_RADIUS) < 0.01, 'wheel spin radius');
const graphics = createGraphics(T, new T.Scene());
const first = graphics.makeCastor();
const second = graphics.makeCastor();
const parts = (g) => {
  const meshes = [];
  g.traverse((o) => {
    if (o.name.startsWith('meshy-castor-')) meshes.push(o);
  });
  return meshes;
};
const a = parts(first),
  b = parts(second);
assert.equal(a.length, 9, 'hull, six wheels, turret ring and gun head');
assert.equal(a.length, b.length);
for (let i = 0; i < a.length; i++) {
  assert.equal(a[i].geometry, b[i].geometry);
  assert.equal(a[i].material, b[i].material);
  assert.ok(a[i].material.map);
  assert.equal(a[i].material.map.colorSpace, T.SRGBColorSpace);
  assert.equal(a[i].material.map.flipY, false);
}
const box = new T.Box3().setFromObject(first);
const size = box.getSize(new T.Vector3());
assert.ok(size.x < 3.2 && size.z < 6.2, 'Castor keeps its gameplay footprint');
assert.ok(Math.abs(box.min.y + 0.8) < 1e-3, 'wheels touch the ground at the gear height');
const sides = first.userData.wheels.map((w) => Math.sign(w.position.x));
assert.equal(sides.filter((s) => s > 0).length, 3, 'three wheels per side');
for (const wheel of first.userData.wheels) {
  assert.ok(Math.abs(wheel.position.x) > 0.9 && Math.abs(wheel.position.x) < 1.3);
  assert.ok(wheel.position.y > -0.4 && wheel.position.y < -0.1);
  // The wheel island is centred on its own axle: spinning keeps it in place.
  const c = wheel.children[0].geometry.boundingBox.getCenter(new T.Vector3());
  assert.ok(Math.abs(c.y) < 0.02 && Math.abs(c.z) < 0.02, 'wheel pivot at its hub');
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
assert.equal(first.userData.identification, undefined, 'no floating colour marker (#106)');
a.forEach((o, i) => assert.equal(o.material, originals[i], 'no random body recoloring'));
// The barrel sits in front of the turret, pointing forward (-Z), and the muzzle
// leaves the gun head.
first.updateMatrixWorld(true);
const muzzle = gun.userData.muzzle.getWorldPosition(new T.Vector3());
gun.rotation.y = 0;
first.updateMatrixWorld(true);
const head = new T.Box3().setFromObject(gun.userData.pitch);
const tip = gun.userData.muzzle.getWorldPosition(new T.Vector3());
assert.ok(Math.abs(tip.z - head.min.z) < 0.05, 'muzzle at the barrel tip');
assert.ok(tip.z < -2.5 && muzzle.y > 2, 'gun on the cab roof, firing forward');
console.log('Castor Meshy: real UV textures, separate articulated components, shared resources OK');
