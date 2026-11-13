import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { makeTracer, updateTracer, TracerPool, TRACER_COLOR, TRACER_EDGE } from '../src/tracers.js';
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(62, 1, 0.00005, 40);
for (const instanced of [false, true]) {
  const pool = new TracerPool(T, scene, 8, { instanced });
  for (const shell of [false, true]) {
    const model = pool.acquire(new T.Vector3(0, 0, -0.1), new T.Vector3(1, 0, 0), undefined, shell);
    const { core, halo } = model.userData;
    assert.equal(core.material.color.getHexString(), new T.Color(TRACER_COLOR).getHexString());
    assert.equal(halo.material.color.getHexString(), new T.Color(TRACER_EDGE).getHexString());
    assert.ok(core.renderOrder > halo.renderOrder);
    for (const part of [core, halo]) {
      assert.equal(part.material.fog, true, 'fog still attenuates tracers');
      assert.equal(part.material.depthTest, true, 'tracers stay hidden by walls');
      assert.equal(part.material.depthWrite, false);
      assert.equal(part.material.blending, T.NormalBlending, 'edge can darken a white background');
    }
    for (const distance of [0.01, 0.1, 1, 10]) {
      model.position.z = -distance;
      updateTracer(T, model, new T.Vector3(1, 0, 0), camera);
      const pixel = (2 * distance * Math.tan((62 * Math.PI) / 360)) / 900;
      assert.ok((model.scale.x * model.userData.width * 1.1) / pixel >= 2 - 1e-8);
      assert.equal(model.scale.z, 1, 'readability never stretches the ballistic trail length');
    }
  }
  pool.flush();
  if (instanced) {
    for (const batch of scene.children.filter((o) => o.isInstancedMesh))
      assert.equal(batch.renderOrder, batch.userData.part === 'core' ? 1 : 0);
  }
  pool.dispose();
}
console.log(
  'Tracers: amber core, dark edge, minimum two-pixel core, occlusion/fog and four instanced batches retained',
);
