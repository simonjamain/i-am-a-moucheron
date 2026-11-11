import assert from 'node:assert/strict';
import { BIPLANE_DATA } from '../src/meshy-biplane-data.js';
import { BIPLANE_BOMBER_DATA } from '../src/meshy-biplane-bomber-data.js';
import { H2_DATA } from '../src/meshy-h2-data.js';
import { MODEL_DATA as STUKA } from '../src/meshy-stuka-data.js';
import { MODEL_DATA as SPITFIRE } from '../src/meshy-spitfire-data.js';
import { MODEL_DATA as TANK } from '../src/meshy-tank-data.js';
import { MODEL_DATA as TRUCK } from '../src/meshy-flaktruck-data.js';

for (const [name, data] of [
  ['Biplane fighter', BIPLANE_DATA],
  ['Biplane bomber', BIPLANE_BOMBER_DATA],
  ['H2', H2_DATA],
  ['Stuka', STUKA],
  ['Spitfire', SPITFIRE],
  ['T3', TANK],
  ['D2', TRUCK],
]) {
  assert.match(data.texture, /^data:image\/jpeg;base64,\/9j\//);
  const jpeg = Uint8Array.from(atob(data.texture.split(',')[1]), (c) => c.charCodeAt(0));
  assert.ok(jpeg.byteLength > 100000, `${name}: real texture image`);
  assert.equal(jpeg[0], 255);
  assert.equal(jpeg[1], 216);
  assert.ok(data.parts.length > 0);
  let triangles = 0;
  for (const part of data.parts) {
    const vertices = Uint8Array.from(atob(part.positions), (c) => c.charCodeAt(0));
    const uv = Uint8Array.from(atob(part.uv), (c) => c.charCodeAt(0));
    const indices = Uint8Array.from(atob(part.indices), (c) => c.charCodeAt(0));
    assert.equal(vertices.byteLength % 6, 0, `${name}: packed vertices`);
    assert.equal(uv.byteLength, (vertices.byteLength / 6) * 4, `${name}: UV per vertex`);
    assert.equal(indices.byteLength % 6, 0, `${name}: triangular indices`);
    const index = new Uint16Array(indices.buffer);
    const vertexCount = vertices.byteLength / 6;
    for (const i of index) assert.ok(i < vertexCount, `${name}: index in range`);
    triangles += index.length / 3;
  }
  // Every vehicle is a user remodel imported with its source triangles.
  if (data.sourceSha256) assert.equal(triangles, data.triangles, `${name}: every source triangle`);
  else assert.ok(triangles >= 26000 && triangles <= 30000, `${name}: original Meshy mesh`);
  console.log(`PASS ${name}: ${triangles} indexed triangles, original UV and JPEG atlas`);
}
