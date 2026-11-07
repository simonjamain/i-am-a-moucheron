import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA as SOCLE } from '../src/meshy-t01-socle-data.js';
import { MODEL_DATA as TETE } from '../src/meshy-t01-tete-data.js';
import { MODEL_DATA as CANON } from '../src/meshy-t01-canon-data.js';
import { MODEL_DATA as CAPTEUR } from '../src/meshy-t01-capteur-data.js';
import {
  createSentryModel,
  SENTRY_MAX_ELEVATION,
  SENTRY_MIN_ELEVATION,
} from '../src/sentry-model.js';

const assets = [SOCLE, TETE, CANON, CAPTEUR];
const expected = [3149, 4380, 3684, 2413];
assert.equal(new Set(assets.map((a) => a.sourceSha256)).size, 4, 'distinct approved Meshy originals');
for (let i = 0; i < assets.length; i++) {
  const a = assets[i];
  assert.equal(a.parts.length, 1, 'each piece is generated independently');
  assert.equal(a.triangles, expected[i]);
  assert.deepEqual(a.sourceTextureResolution, [2048, 2048]);
  assert.deepEqual(a.atlasResolution, [1024, 1024]);
  assert.ok(a.texture.startsWith('data:image/webp;base64,'), 'Meshy base colors kept in a WebP atlas');
  assert.equal(a.parts[0].pivot.length, 3);
  assert.equal(Buffer.from(a.parts[0].positions, 'base64').byteLength, a.vertices * 3 * 2);
  assert.equal(Buffer.from(a.parts[0].uv, 'base64').byteLength, a.vertices * 2 * 2);
  assert.equal(Buffer.from(a.parts[0].indices, 'base64').byteLength, a.triangles * 3 * 2);
  assert.equal(Buffer.from(a.texture.split(',')[1], 'base64').toString('ascii', 8, 12), 'WEBP');
}
const { group, yaw, pitch, radar, muzzle } = createSentryModel(T);
assert.equal(yaw.parent, group);
assert.equal(pitch.parent, yaw);
assert.equal(radar.parent, yaw);
assert.equal(group.getObjectByName('canon-unique')?.parent, pitch);
assert.equal(group.getObjectByName('capteur-meshy')?.parent, radar);
assert.equal(group.getObjectByName('socle-fixe')?.parent, group);
assert.equal(SENTRY_MIN_ELEVATION, (-10 * Math.PI) / 180);
assert.equal(SENTRY_MAX_ELEVATION, Math.PI / 2);
let triangles = 0;
const components = [];
group.traverse((obj) => {
  if (!obj.isMesh || !obj.userData.meshyShared) return;
  components.push(obj);
  triangles += obj.geometry.getIndex().count / 3;
  assert.ok(obj.material.map, 'source Meshy atlas is assigned to every part');
  assert.equal(obj.material.map.flipY, false, 'GLB UV coordinate orientation');
});
assert.equal(components.length, 4);
assert.equal(triangles, 13626);
const world = new T.Group();
world.add(group);
world.updateMatrixWorld(true);
const horizontal = muzzle.getWorldPosition(new T.Vector3());
pitch.rotation.x = Math.PI / 2;
world.updateMatrixWorld(true);
const vertical = muzzle.getWorldPosition(new T.Vector3());
assert.ok(vertical.y - horizontal.y > 0.04, 'gun barrel points vertically to +90°');
const a = createSentryModel(T);
const b = createSentryModel(T);
assert.notEqual(a.pitch, b.pitch, 'independent pivots per sentry');
assert.equal(
  a.group.getObjectByName('canon-unique').geometry,
  b.group.getObjectByName('canon-unique').geometry,
  'GPU geometry reused between sentry instances',
);
console.log('T-01: four real Meshy textured meshes, shared data and independent 90° pivots OK');
