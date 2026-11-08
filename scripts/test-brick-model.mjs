// Issue #99: approved 2×4 LEGO brick (Meshy image-to-3D, untextured), studs up,
// recoloured by the game, proportioned like the reference and stacked by rows.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { BRICK_SOURCE, BRICK_POSITIONS, BRICK_INDICES } from '../src/meshy-brick-data.js';
import {
  BRICK_DEPTH,
  BRICK_HEIGHT,
  BRICK_PITCH,
  BRICK_ROW,
  brickGeometry,
  brickLayout,
  createBrickWall,
} from '../src/brick-wall.js';

assert.equal(BRICK_SOURCE.sourceTask, '01a1ba16-7dde-758d-82fb-74eb5b54fa80');
assert.match(BRICK_SOURCE.sourceSha256, /^[a-f0-9]{64}$/);
assert.match(BRICK_SOURCE.referenceSha256, /^[a-f0-9]{64}$/);
assert.equal(BRICK_SOURCE.up, 'y');
assert.equal(BRICK_INDICES.length / 3, BRICK_SOURCE.triangles);
assert.ok(BRICK_SOURCE.triangles <= 1500, 'light enough to instance by hundreds');
assert.equal(BRICK_POSITIONS.length / 3, BRICK_SOURCE.vertices);

// Normalized unit brick resting on y = 0 with its studs on top (no rotation).
const geometry = brickGeometry(T);
geometry.computeBoundingBox();
const box = geometry.boundingBox;
assert.ok(Math.abs(box.min.y) < 1e-6 && Math.abs(box.max.y - 1) < 1e-6);
const y = geometry.getAttribute('position');
let top = 0,
  bottom = 0;
for (let i = 0; i < y.count; i++) {
  if (y.getY(i) > 0.85) top++;
  if (y.getY(i) < 0.15) bottom++;
}
assert.ok(top > bottom * 3, 'studs are on the top face');

// Reference proportions: 2×4 is half as deep as long; body height = one row.
assert.equal(BRICK_DEPTH, BRICK_PITCH / 2);
assert.ok(BRICK_HEIGHT > BRICK_ROW && BRICK_HEIGHT < BRICK_ROW * 1.4, 'studs rise above the body');
const wall = createBrickWall(T, { a: [0, 0], b: [0.2, 0], hp: 100 });
assert.equal(wall.count, brickLayout(0.2).length);
assert.ok(wall.instanceColor, 'the game colours each brick (no Meshy texture)');
const m = new T.Matrix4(),
  s = new T.Vector3();
wall.getMatrixAt(0, m);
m.decompose(new T.Vector3(), new T.Quaternion(), s);
assert.ok(Math.abs(s.z - BRICK_DEPTH) < 1e-6 && Math.abs(s.y - BRICK_HEIGHT) < 1e-6);
console.log('Brick model: approved Meshy 2×4, studs up, recoloured, 2:1 depth, row-stacked.');
