import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { InsectIndex, nearestInsectHit } from '../src/insect-hits.js';
const scene = new T.Scene();
const graphics = createGraphics(T, scene);
const insects = new Map();
for (let i = 0; i < 180; i++) {
  const g = graphics.insect(['midge', 'ant', 'roach', 'dart', 'guard', 'brute'][i % 6]);
  g.position.set(
    (i % 10) * 0.12 - 0.6,
    Math.floor(i / 60) * 0.12,
    -0.3 - Math.floor(i / 10) * 0.08,
  );
  g.scale.set(0.01 + (i % 3) * 0.005, 0.018, 0.015);
  g.rotation.set(i * 0.17, i * 0.29, i * 0.11);
  insects.set(i, g);
}
const index = new InsectIndex(T, insects, 0.08);
function compare(origin, direction, distance, excluded) {
  const expected = nearestInsectHit(T, origin, direction, insects, distance, excluded);
  const actual = nearestInsectHit(T, origin, direction, insects, distance, excluded, index);
  assert.equal(actual?.id, expected?.id);
  if (actual) assert.ok(Math.abs(actual.distance - expected.distance) < 1e-10);
}
for (let i = 0; i < 180; i++) {
  const target = insects.get(i).position;
  const origin = new T.Vector3(Math.sin(i) * 0.3, Math.cos(i) * 0.2, 0.2);
  const dir = target.clone().sub(origin);
  compare(origin, dir, 3);
  compare(origin, dir, 0.02);
  compare(origin, dir, 3, new Set([i]));
}
// A sphere spanning a cell boundary must be found from either direction,
// including axis-aligned, negative and corner-crossing segments.
for (const origin of [new T.Vector3(), new T.Vector3(-0.8, -0.8, -0.8)])
  for (const dir of [new T.Vector3(0, 0, -1), new T.Vector3(1, 1, 1), new T.Vector3(-1, 0, 0)])
    compare(origin, dir, 4);
// Lazy rebuild after movement, deletion between queries and index invalidation.
insects.get(0).position.set(0, 0, -0.15);
index.invalidate();
compare(new T.Vector3(), new T.Vector3(0, 0, -1), 1);
insects.delete(0);
compare(new T.Vector3(), new T.Vector3(0, 0, -1), 1);
// Unbounded rays use the reference path rather than an unbounded grid walk.
compare(new T.Vector3(), new T.Vector3(0, 0, -1), Infinity);
console.log(
  'PASS: indexed impacts equal exhaustive hits for all six species, scaled/rotated models, ranges, exclusions, boundaries and invalidation.',
);

// Equal-distance impacts retain insertion order even when IDs are not sorted.
const duplicate = graphics.insect();
duplicate.scale.setScalar(0.018);
duplicate.position.set(0, 0, -0.1);
insects.set(900, duplicate);
insects.set(-2, duplicate);
index.invalidate();
compare(new T.Vector3(), new T.Vector3(0, 0, -1), 1);
// Nested transforms and oversized models take the same conservative path.
const parent = new T.Group();
parent.position.set(1, 0, 0);
scene.add(parent);
parent.add(duplicate);
duplicate.scale.setScalar(1);
index.invalidate();
compare(new T.Vector3(1, 0, 1), new T.Vector3(0, 0, -2), 2);
