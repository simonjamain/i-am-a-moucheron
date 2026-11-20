import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  entryRingMaterial,
  makeEntryRing,
  RING_HALF_WIDTH,
  RING_MAX_HALF_WIDTH,
  RING_MIN_PIXELS,
  RING_QUAD,
  RING_RADIUS,
} from '../src/entry-ring.ts';

// The entry circle must stay visible without MSAA: its line width is computed
// from screen-space derivatives with a pixel floor, not from thin geometry.
assert.ok(RING_MIN_PIXELS >= 1.5, 'the line keeps at least ~1.5 screen pixels');
assert.ok(RING_HALF_WIDTH > 0 && RING_MAX_HALF_WIDTH > RING_HALF_WIDTH);
assert.ok(RING_RADIUS + RING_MAX_HALF_WIDTH < RING_QUAD, 'the quad hosts the widest line');
const material = entryRingMaterial(T);
assert.match(material.fragmentShader, /fwidth\(r\)/, 'width follows the pixel size');
assert.match(material.fragmentShader, /logdepthbuf_fragment/, 'depth matches the log buffer');
assert.equal(material.depthWrite, false);
assert.equal(material.transparent, true);
const ring = makeEntryRing(T);
assert.equal(ring.renderOrder, 5);
assert.ok(Math.abs(ring.rotation.x + Math.PI / 2) < 1e-9, 'lies flat on the floor');
assert.ok(ring.clone().material === ring.material, 'clones share one material');
console.log('Entry ring: pixel-floored shader line, shared material, flat quad.');
