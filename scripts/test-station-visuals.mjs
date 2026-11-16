import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { makeServiceStation, animateRadar } from '../src/station-model.js';
import { ShopThumbnails } from '../src/shop-thumbs.js';

const radar = makeServiceStation(T, 'radar');
const base = radar.children[0];
const moving = radar.userData.dish.children[0];
// The source dish has 160 triangles; its 74-triangle fork attaches it to the
// top of the bearing. The fork must follow the dish, leaving the bearing fixed.
assert.equal(moving.geometry.index.count / 3, 234, 'dish and complete fork rotate together');
assert.equal(base.children[0].geometry.index.count / 3, 440, 'base and bearing stay fixed');
radar.updateMatrixWorld(true);
const baseMatrix = base.matrixWorld.clone();
const vertex = new T.Vector3().fromBufferAttribute(moving.geometry.attributes.position, 0);
const before = moving.localToWorld(vertex.clone());
animateRadar(radar, Math.PI / 2);
radar.updateMatrixWorld(true);
assert.ok(base.matrixWorld.equals(baseMatrix));
assert.ok(moving.localToWorld(vertex.clone()).distanceTo(before) > 0.01);

// Only the renderer adapter is replaced: all shop model factories, geometry,
// textures, and texture-readiness behavior run through the public constructor.
class Renderer {
  constructor() {
    this.domElement = { toDataURL: () => 'data:image/png;base64,' };
  }
  render() {}
  setPixelRatio() {}
  setSize() {}
}
const graphicsAPI = { ...T, WebGLRenderer: Renderer };
const shop = new ShopThumbnails(graphicsAPI);
for (const kind of ['refuel', 'radar']) {
  const actual = makeServiceStation(graphicsAPI, kind);
  const thumbnail = shop.models.get(kind);
  const resources = (model) => {
    const meshes = [];
    model.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    return meshes;
  };
  shop.render(kind);
  const centre = new T.Box3().setFromObject(thumbnail).getCenter(new T.Vector3());
  assert.ok(shop.camera.position.z > centre.z, kind + ' picture shows the source model front (+Z)');
  const a = resources(actual),
    b = resources(thumbnail);
  assert.equal(b.length, a.length, kind + ' shop uses all real model parts');
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].geometry, a[i].geometry, kind + ' same in-game geometry');
    assert.equal(b[i].material, a[i].material, kind + ' same original textured material');
  }
}
console.log(
  'Station visuals: rotating fork with fixed bearing; shop shares actual station models and textures',
);
