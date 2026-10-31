import { performance } from 'node:perf_hooks';
import * as T from '../vendor/three.module.min.js';
import { TracerPool } from '../src/tracers.js';
for (const count of [32, 128, 256]) {
  for (const instanced of [false, true]) {
    const scene = new T.Scene(),
      pool = new TracerPool(T, scene, 256, { instanced });
    for (let i = 0; i < count; i++)
      pool.acquire(new T.Vector3(i * 0.001, 0, -0.2), new T.Vector3(0, 0, -1), '#aef', i % 3 === 0);
    const samples = [];
    for (let i = 0; i < 130; i++) {
      const start = performance.now();
      pool.flush();
      scene.updateMatrixWorld();
      if (i >= 30) samples.push(performance.now() - start);
    }
    let renderObjects = 0,
      triangles = 0;
    scene.traverse((m) => {
      if (!m.isMesh) return;
      renderObjects++;
      triangles +=
        ((m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3) *
        (m.isInstancedMesh ? m.count : 1);
    });
    samples.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        count,
        instanced,
        renderObjects,
        triangles,
        cpuMatricesMedianMs: +samples[50].toFixed(4),
        note: 'CPU scene inventory, not measured draw calls/FPS/GPU time',
      }),
    );
    pool.dispose();
  }
}
