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
assert.equal(triangles, 2357, 'every triangle of the remodelled M1');
assert.ok(draws <= 8, 'bounded draw calls');
const meshes = (model) => {
  const list = [];
  model.traverse((o) => o.isMesh && list.push(o));
  return list;
};
const [hull] = meshes(a);
assert.equal(hull.geometry, meshes(b)[0].geometry, 'share immutable buffers');
assert.ok(hull.geometry.attributes.uv, 'Meshy UVs preserved');
assert.ok(hull.material.map, 'actual Meshy atlas retained');
assert.equal(hull.material.map.colorSpace, T.SRGBColorSpace);
assert.equal(hull.material.map.flipY, false);
assert.equal(a.userData.pilotMuzzles.length, 2, 'two nose machine guns');
assert.notEqual(a.userData.prop, b.userData.prop, 'independent animation');
const blade = a.userData.prop.children[0];
a.updateMatrixWorld(true);
const vertex = new T.Vector3().fromBufferAttribute(blade.geometry.attributes.position, 0);
const before = blade.localToWorld(vertex.clone());
a.userData.prop.rotation.z += 0.7;
a.updateMatrixWorld(true);
assert.ok(blade.localToWorld(vertex.clone()).distanceTo(before) > 0.01);
assert.equal(b.userData.prop.rotation.z, 0);
const originalMeshes = [];
a.traverse((mesh) => {
  if (mesh.isMesh) originalMeshes.push([mesh, mesh.material]);
});
paintVehicle(T, a, 7, '#7b8155');
assert.ok(a.userData.preserveTexture);
assert.equal(a.userData.identification, undefined, 'no floating colour marker (#106)');
for (const [mesh, originalMaterial] of originalMeshes)
  assert.equal(mesh.material, originalMaterial, 'Meshed camouflage stays unchanged');
paintVehicle(T, a, 8, '#7b8155');
assert.equal(a.userData.identification, undefined, 'sequence updates add no marker');
console.log(
  `PASS: M1 Meshy ${triangles} triangles, ${draws} draws, shared buffers, livery and prop animation.`,
);
