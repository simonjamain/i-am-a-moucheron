import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle } from '../src/vehicle-livery.js';
const scene = new T.Scene();
const graphics = createGraphics(T, scene);
const a = graphics.makePlane('#7b8155');
const b = graphics.makePlane('#7b8155');
const bounds = new T.Box3().setFromObject(a);
assert.ok(Math.abs(bounds.min.y + 1.05) < 1e-5, 'retain parked ground contact');
assert.ok(Math.abs(bounds.max.x - bounds.min.x - 5.6) < 0.001, 'retain span');
let triangles = 0;
let draws = 0;
a.traverse((mesh) => {
  if (!mesh.isMesh) return;
  draws++;
  triangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
  for (const key of ['position', 'normal', 'color']) {
    const attribute = mesh.geometry.attributes[key];
    if (attribute) assert.ok(attribute.array.every(Number.isFinite), key);
  }
});
assert.ok(triangles <= 2900, 'bounded browser geometry');
assert.ok(draws <= 8, 'bounded draw calls');
assert.equal(a.children[2].geometry, b.children[2].geometry, 'share immutable buffers');
assert.notEqual(a.userData.prop, b.userData.prop, 'independent animation');
const blade = a.userData.prop.children[0];
a.updateMatrixWorld(true);
const vertex = new T.Vector3().fromBufferAttribute(blade.geometry.attributes.position, 0);
const before = blade.localToWorld(vertex.clone());
a.userData.prop.rotation.z += 0.7;
a.updateMatrixWorld(true);
assert.ok(blade.localToWorld(vertex.clone()).distanceTo(before) > 0.01);
assert.equal(b.userData.prop.rotation.z, 0);
const fullSpan = new T.Box3().setFromObject(a.userData.wing).getSize(new T.Vector3()).x;
a.userData.wing.scale.x = 0.52;
assert.ok(new T.Box3().setFromObject(a.userData.wing).getSize(new T.Vector3()).x < fullSpan * 0.53);
paintVehicle(T, a, 7, '#7b8155');
assert.ok(a.userData.paint);
assert.ok(
  a.children.some((mesh) => mesh.material === a.userData.paint),
  'livery remains visible',
);
console.log(
  `PASS: M1 Meshy ${triangles} triangles, ${draws} draws, shared buffers, livery, wing damage and prop animation.`,
);
