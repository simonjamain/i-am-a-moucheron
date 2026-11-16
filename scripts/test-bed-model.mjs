import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA } from '../src/meshy-bed-data.js';
import { makeBed } from '../src/bed-model.js';
import { makeInstallationCollider, makeServiceStation } from '../src/station-model.js';
import { bedSpawn, bedAccess } from '../src/beds.js';
import { ShopThumbnails } from '../src/shop-thumbs.js';
import { MAP, ACTOR_UNIT } from '../src/scale.js';
import { baseWorld } from '../src/base.js';
assert.equal(
  MODEL_DATA.sourceSha256,
  '3ddaba9b3f39927101d6a16a429083a0a13811f8b18484e2a0f05a8cf9e64e49',
);
assert.equal(MODEL_DATA.triangles, 310);
const bed = makeBed(T);
const mesh = bed.children[0];
assert.equal(mesh.geometry.index.count, 930);
assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
assert.ok(mesh.material.map);
const box = new T.Box3().setFromObject(bed);
assert.ok(Math.abs(box.min.y) < 1e-7);
assert.ok(Math.abs(box.getSize(new T.Vector3()).x - 4) < 0.001);
assert.equal(mesh.geometry, makeBed(T).children[0].geometry, 'instances share geometry');
class Renderer {
  constructor() {
    this.domElement = { toDataURL: () => 'data:image/png;base64,' };
  }
  render() {}
  setSize() {}
  setPixelRatio() {}
}
const graphicsAPI = { ...T, WebGLRenderer: Renderer };
const shop = new ShopThumbnails(graphicsAPI);
const shopBed = makeBed(graphicsAPI).children[0];
assert.equal(shop.models.get('bed').children[0].geometry, shopBed.geometry, 'shop uses real bed');
assert.equal(shop.models.get('bed').children[0].material, shopBed.material, 'shop uses real atlas');
const source = readFileSync('src/client.js', 'utf8');
const context = vm.createContext({ T, MAP, makeBed, makeServiceStation, scene: new T.Scene() });
vm.runInContext(
  source.slice(
    source.indexOf('function installationModel(st)'),
    source.indexOf("$('paperTear').onclick"),
  ),
  context,
);
const placed = vm.runInContext("installationModel({kind:'bed',x:0,y:0,z:0})", context);
assert.equal(
  placed.children[0].geometry,
  mesh.geometry,
  'world and placement preview use real bed',
);
assert.equal(placed.scale.x, MAP.ratio);
const floor = new T.Box3(new T.Vector3(-4, -0.1, -4), new T.Vector3(4, 0, 4));
for (const angle of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 3]) {
  const station = { kind: 'bed', x: 0.1, y: 0.00005, z: 0.2, angle };
  const model = makeBed(T);
  model.position.set(station.x, station.y, station.z);
  model.rotation.y = angle;
  model.scale.setScalar(MAP.ratio);
  const collider = makeInstallationCollider(T, model);
  const spawn = bedSpawn(station, [floor], [station]);
  assert.ok(spawn);
  const point = baseWorld(spawn);
  assert.ok(bedAccess(point, station), 'respawn stays near the bed');
  const expanded = collider.clone().expandByScalar(0.16 * ACTOR_UNIT);
  assert.equal(
    expanded.containsPoint(new T.Vector3(point.x, station.y + 0.001, point.z)),
    false,
    'respawn is outside the rotated bed and walking radius',
  );
}
console.log(
  'Drawer Bed: provenance, original textured geometry shared in world/ghost/shop, safe rotated respawn',
);
