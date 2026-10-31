import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { TracerPool, updateTracer } from '../src/tracers.js';
const scene = new T.Scene();
const pool = new TracerPool(T, scene, 8, { instanced: true });
const camera = new T.PerspectiveCamera();
camera.position.set(1, 2, 3);
const active = [];
for (let i = 0; i < 8; i++) {
  const direction = new T.Vector3(Math.sin(i), Math.cos(i), -1).normalize();
  const model = pool.acquire(
    new T.Vector3(i * 0.01, 0.2, -0.4),
    direction,
    i % 2 ? '#12a4ef' : '#ef3421',
    i % 3 === 0,
  );
  updateTracer(T, model, direction, camera);
  model.scale.z = 0.7;
  active.push(model);
}
pool.flush();
const batches = scene.children.filter((o) => o.isInstancedMesh);
assert.equal(batches.length, 4, 'two parts per calibre, regardless of shot count');
assert.equal(scene.children.length, 4, 'only batches enter the scene');
assert.equal(
  batches.reduce((n, b) => n + b.count, 0),
  16,
);
const matrix = new T.Matrix4(),
  color = new T.Color();
for (const batch of batches) {
  const models = active.filter((m) => m.userData.shell === batch.userData.shell);
  for (let i = 0; i < models.length; i++) {
    const source = models[i].userData[batch.userData.part];
    batch.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every((v, j) => Math.abs(v - source.matrixWorld.elements[j]) < 1e-6));
    if (batch.userData.part === 'halo') {
      batch.getColorAt(i, color);
      assert.ok(
        color.toArray().every((v, j) => Math.abs(v - source.material.color.toArray()[j]) < 1e-6),
      );
    }
  }
}
assert.equal(pool.acquire(new T.Vector3(), new T.Vector3(0, 0, -1), '#fff'), null);
active[0].userData.dispose();
active[0].userData.dispose();
pool.flush();
assert.equal(
  batches.reduce((n, b) => n + b.count, 0),
  14,
);
const reused = pool.acquire(new T.Vector3(), new T.Vector3(0, 0, -1), '#f0f', true);
assert.equal(reused, active[0]);
pool.flush();
assert.equal(
  batches.reduce((n, b) => n + b.count, 0),
  16,
);
pool.dispose();
assert.equal(scene.children.length, 0);
const fallback = new TracerPool(T, scene, 1);
assert.equal(fallback.acquire(new T.Vector3(), new T.Vector3(0, 0, -1), '#fff').parent, scene);
fallback.dispose();
console.log(
  'PASS: four tracer batches, exact world transforms/colors, both calibres, capacity, idempotent release, reuse, cleanup and ordinary-renderer fallback.',
);
