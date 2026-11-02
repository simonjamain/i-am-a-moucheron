import assert from 'node:assert/strict';
import { segmentSphere } from '../src/ordnance.js';
import { sweptSphereMayTouch } from '../src/swept-broadphase.js';

// Conservative bounding box: false positives allowed, false negatives not.
const cases = [
  [[0, 0, 0], [1, 0, 0], [0.5, 0, 0], 0.01],
  [[0, 0, 0], [1, 0, 0], [0.5, 1, 0], 1],
  [[1, 0, 0], [0, 0, 0], [0.5, 0, 0], 0.01],
  [[0, 0, 0], [0, 0, 0], [0, 0, 0], 0.01],
  [[0, 0, 0], [0, 0, 0], [4, 0, 0], 0.01],
];
let seed = 0x1234abcd;
const rand = () =>
  ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (let i = 0; i < 50 * 900; i++) {
  const a = Array.from({ length: 3 }, () => (rand() - 0.5) * 4);
  const b = a.map((v) => v + (rand() - 0.5) * 0.4);
  const c = Array.from({ length: 3 }, () => (rand() - 0.5) * 4);
  cases.push([a, b, c, 0.002 + rand() * 0.1]);
}
for (const [a, b, c, radius] of cases) {
  if (segmentSphere(a, b, c, radius) !== null)
    assert.equal(sweptSphereMayTouch(a, b, c, radius), true, 'no missed exact hit');
}
assert.equal(sweptSphereMayTouch([0, 0, 0], [1, 0, 0], [2, 0, 0], 0.1), false);
console.log('PASS: conservative swept-sphere broad phase (45,000 randomized pairs).');
