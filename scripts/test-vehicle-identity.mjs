// Issue #106: no colour identity per player/vehicle, original colours kept,
// and no seat marker: posts are aimed at directly (src/seat-posts.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.webgpu.min.js';
import { paintVehicle } from '../src/vehicle-livery.ts';

// Procedural model: the original base colour is kept for every sequence.
const make = () => {
  const g = new T.Group();
  g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#7b8155' })));
  g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#222222' })));
  return g;
};
const first = make(),
  second = make();
paintVehicle(T, first, 1, '#7b8155');
paintVehicle(T, second, 9, '#7b8155');
assert.ok(first.children[0].material.color.equals(new T.Color('#7b8155')));
assert.ok(first.children[0].material.color.equals(second.children[0].material.color));
assert.notEqual(first.children[0].material, second.children[0].material, 'private paint for dirt');
assert.ok(first.userData.baseColor.equals(new T.Color('#7b8155')));
assert.equal(first.userData.identification, undefined);
// Meshy model: untouched.
const meshy = make();
meshy.userData.preserveTexture = true;
const original = meshy.children[0].material;
paintVehicle(T, meshy, 3, '#7b8155');
assert.equal(meshy.children[0].material, original);
assert.equal(meshy.children.length, 2, 'no floating disk added');

const client = readFileSync('src/client.js', 'utf8');
assert.doesNotMatch(client, /vehicleHue|userData\.identification/);
assert.doesNotMatch(client, /pilot: 'P', dorsal: 'D'/, 'no seat letters');
assert.doesNotMatch(client, /roleEntry|drawSeatIcon|entryRing/, 'no seat circle nor pictogram');
console.log('Vehicle identity: no colour markers, original colours, no seat circle nor pictogram.');
