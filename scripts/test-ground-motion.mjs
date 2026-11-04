import assert from 'node:assert/strict';
import { GroundMotionTrack, GROUND_VISUAL_DELAY_MS } from '../src/ground-motion.js';

const actor = (x, arrived = false) => ({
  p: [x, 0],
  dir: [1, 0],
  arrived,
});
const snapshot = (time, agents, { wave = 1, phase = 'combat' } = {}) => ({
  code: 'SMOOTH',
  base: { epoch: 1 },
  wave,
  started: 0,
  phase,
  sentAt: time,
  groundAgents: agents,
});

// Reproduce the defect: snapshots spaced 250 ms apart produce 2 cm jumps
// with direct position copies. With interpolation, frames at 60 Hz move steadily.
const track = new GroundMotionTrack();
let previousRaw = 0;
let lastRaw = 0;
let previousVisual = 0;
let maxRawStep = 0;
let maxVisualStep = 0;
let nextUpdate = 0;
for (let now = 0; now <= 2000; now += 1000 / 60) {
  while (nextUpdate <= now) {
    track.observe(snapshot(nextUpdate, { 1: actor(nextUpdate * 0.00008) }));
    previousRaw = nextUpdate * 0.00008;
    nextUpdate += 250;
  }
  const visual = track.sample(now)(1).p[0];
  const raw = Math.floor(now / 250) * 250 * 0.00008;
  maxRawStep = Math.max(maxRawStep, Math.abs(raw - lastRaw));
  lastRaw = raw;
  maxVisualStep = Math.max(maxVisualStep, Math.abs(visual - previousVisual));
  previousVisual = visual;
  assert.ok(
    visual >= -1e-10 && visual <= previousRaw + 1e-10,
    'no extrapolation beyond the authority',
  );
}
assert.equal(GROUND_VISUAL_DELAY_MS, 300);
assert.ok(maxRawStep >= 0.019, 'direct snapshot copies move in visible 2 cm jumps');
assert.ok(maxVisualStep < 0.004, 'interpolation removes quarter-second position jumps');
assert.ok(track.frames.length <= 12, 'history remains bounded');

const stopped = new GroundMotionTrack();
stopped.observe(snapshot(0, { 1: actor(0) }));
stopped.observe(snapshot(250, { 1: actor(0.02) }));
stopped.observe(snapshot(500, { 1: actor(0.02) }));
assert.ok(Math.abs(stopped.sample(425)(1).p[0] - 0.01) < 1e-10);
assert.equal(stopped.sample(900)(1).p[0], 0.02, 'no extrapolation into barricades or food');
assert.equal(stopped.sample(3000)(1).p[0], 0.02, 'a stalled network holds the last safe pose');

const arriving = new GroundMotionTrack();
arriving.observe(snapshot(0, { 1: actor(0) }));
arriving.observe(snapshot(250, { 1: actor(0.02, true), 2: actor(3) }));
assert.equal(arriving.sample(425)(1).arrived, false, 'arrival is delayed with the pose');
assert.equal(arriving.sample(550)(1).arrived, true);
assert.equal(arriving.sample(425)(2).p[0], 3, 'new agents must not interpolate from the origin');
arriving.observe(snapshot(200, { 1: actor(9) }));
assert.equal(arriving.sample(550)(1).p[0], 0.02, 'stale snapshots cannot rewind motion');
arriving.observe(snapshot(600, { 1: actor(4) }, { wave: 2 }));
assert.equal(arriving.sample(600)(1).p[0], 4, 'new waves must not glide from old positions');
arriving.observe(snapshot(700, {}, { wave: 2, phase: 'prep' }));
assert.equal(arriving.sample(700)(1), undefined, 'preparation clears the old movement history');

console.log('PASS: 250 ms ground snapshot smoothing, stationary holds, spawn, arrival and reset.');
