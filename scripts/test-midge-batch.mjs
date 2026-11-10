import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.module.min.js';
import { MidgeBatch, MIDGE_LOD } from '../src/midge-batch.js';
import { nearestInsectHit, InsectIndex } from '../src/insect-hits.js';

const scene = new T.Scene();
const batch = new MidgeBatch(T, scene, { capacity: 2 });
const counts = () => [batch.detail?.mesh?.count ?? 0, ...batch.meshes.map((m) => m.count)];
const insects = new Map();
function add(id, x = 0, y = 0, z = -1) {
  const m = batch.create(id * 0.1);
  m.position.set(x, y, z);
  m.scale.setScalar(0.01);
  insects.set(id, m);
  return m;
}
const first = add(0);
add(1, 0.05, 0, -2);
batch.flush(insects, 300);
assert.equal(scene.children.length, 4, 'Meshy model + far body, head and wings: four draws');
assert.ok(scene.children.every((o) => o.isInstancedMesh && !o.userData.projectileSolid));
assert.deepEqual(counts(), [2, 0, 0, 0], 'without a camera every midge gets the Meshy model');
const matrix = new T.Matrix4();
batch.detail.mesh.getMatrixAt(0, matrix);
assert.ok(Math.abs(matrix.elements[14] + 1) < 1e-6, 'model matrix is positioned correctly');
assert.ok(
  batch.detail.phases.array[0] !== batch.detail.phases.array[1],
  'neighbouring midges beat out of step',
);
// Level of detail: tiny on screen -> three cheap ellipsoid batches.
const camera = new T.PerspectiveCamera();
camera.position.set(0, 0, -1.5); // both within 1 m: radius 0.015 m -> ratio >= 0.015
camera.updateMatrixWorld();
batch.flush(insects, 300, camera);
assert.deepEqual(counts(), [2, 0, 0, 0], 'near midges keep the Meshy model');
camera.position.set(0, 0, (0.01 * 1.5) / MIDGE_LOD.ratio + 3);
camera.updateMatrixWorld();
batch.flush(insects, 300, camera);
assert.deepEqual(counts(), [0, 2, 2, 4], 'distant midges use the cheap batches');
batch.meshes[0].getMatrixAt(0, matrix);
assert.ok(Math.abs(matrix.elements[14] + 1) < 1e-6, 'far body matrix is positioned correctly');
const loop = batch.detail.uniforms.vatTime;
batch.flush(insects, 250);
const before = loop.value;
batch.flush(insects, 500);
assert.ok(Math.abs(loop.value - before - 0.25) < 1e-9, 'animation clock advances with time');
assert.equal(
  nearestInsectHit(T, new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -1), insects, 3)?.id,
  0,
  'the instanced midge proxy can be hit with a sphere despite having no mesh',
);
assert.equal(
  nearestInsectHit(T, new T.Vector3(0.03, 0, 0), new T.Vector3(0, 0, -1), insects, 3),
  null,
  'near misses do not inherit an oversized approximate hitbox',
);
// Check that a packed ray still returns the earliest midge, independent of insertion order.
for (let id = 2; id < 300; id++) add(id, 0, 0, -1.5 - id * 0.01);
const indexed = new InsectIndex(T, insects);
const origin = new T.Vector3(0, 0, 0),
  direction = new T.Vector3(0, 0, -1);
assert.equal(nearestInsectHit(T, origin, direction, insects, 6, null, indexed)?.id, 0);
insects.delete(0);
batch.flush(insects, 350);
assert.equal(batch.detail.mesh.count, 299);
assert.equal(nearestInsectHit(T, origin, direction, insects, 6, null, indexed)?.id, 2);
assert.equal(nearestInsectHit(T, origin, direction, insects, 6)?.id, 2);
// Resizing must preserve correct matrices and avoid one scene object per insect.
for (let id = 300; id < 10000; id++)
  add(id, (id % 100) * 0.04, Math.floor(id / 100) * 0.04, -1 - id * 0.001);
const start = performance.now();
batch.flush(insects, 400);
const cpuMs = performance.now() - start;
assert.equal(batch.detail.mesh.count, MIDGE_LOD.limit, 'the Meshy model is capped');
assert.equal(batch.meshes[0].count, 9999 - MIDGE_LOD.limit);
assert.equal(batch.meshes[1].count, 9999 - MIDGE_LOD.limit);
assert.equal(batch.meshes[2].count, 2 * (9999 - MIDGE_LOD.limit));
assert.equal(scene.children.length, 4);
console.log(
  JSON.stringify({
    instancedMidges: 9999,
    meshyMidges: batch.detail.mesh.count,
    drawBatches: scene.children.length,
    flushCpuMs: +cpuMs.toFixed(2),
    note: 'CPU only, not rendered GPU FPS',
  }),
);
batch.dispose();
assert.equal(scene.children.length, 0);
const fallback = new MidgeBatch(T, scene, { enabled: false });
fallback.flush(insects);
assert.equal(scene.children.length, 0);
fallback.dispose();
assert.equal(first.parent, null, 'proxies never enter the Three.js scene');
console.log(
  'PASS: Meshy model with per-instance flight phase, distance LOD, shared instanced meshes, independent hit spheres, indexed hits, batch growth and disposal.',
);
