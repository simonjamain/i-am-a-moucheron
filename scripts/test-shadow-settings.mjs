import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { applyShadowPreset } from '../src/shadow-settings.js';
import { createOffice } from '../src/office.js';
import { createGraphics } from '../src/graphics.js';
const scene = new T.Scene();
createOffice(T, scene, { ...createGraphics(T, scene), textLabel: () => new T.Group() });
const renderer = { shadowMap: {} };
const inventory = () => {
  let meshes = 0,
    vertices = 0,
    casters = 0,
    receivers = 0;
  scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      vertices += o.geometry.attributes.position.count;
      casters += Number(o.castShadow);
      receivers += Number(o.receiveShadow);
    }
  });
  const sun = scene.children.find((o) => o.isDirectionalLight);
  return {
    meshes,
    vertices,
    casters,
    receivers,
    shadowMap: sun.shadow.mapSize.toArray(),
    frustum: [
      sun.shadow.camera.left,
      sun.shadow.camera.right,
      sun.shadow.camera.top,
      sun.shadow.camera.bottom,
    ],
  };
};
applyShadowPreset(T, renderer, scene, 'baseline');
const before = inventory();
assert.equal(renderer.shadowMap.type, T.PCFSoftShadowMap);
applyShadowPreset(T, renderer, scene, 'landing');
assert.deepEqual(inventory(), before, 'no added mesh, caster, receiver or shadow-map resolution');
assert.equal(renderer.shadowMap.type, T.BasicShadowMap);
assert.equal(scene.children.find((o) => o.isHemisphereLight).intensity, 1.5);
assert.equal(scene.children.find((o) => o.isDirectionalLight).intensity, 4);
assert.equal(before.shadowMap[0], 2048);
console.log(
  JSON.stringify({
    test: 'shadow configuration and identical scene inventory',
    inventory: before,
    note: 'structural check only; no WebGL frame-time or visual acceptance',
  }),
);
