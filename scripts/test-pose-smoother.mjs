// A vehicle moving at constant speed whose displayed target changes source: the pilot's
// delayed stream, then the server's latest snapshot (the pilot got out), then the stream again
// (someone boards). The old display chased the target with lerp(1 − e^(−24·dt)).
import assert from 'node:assert/strict';
import { PoseSmoother } from '../src/pose-smoother.ts';

const SPEED = 40,
  DELAY = 0.16,
  SNAPSHOT = 0.1;
const truth = (t) => SPEED * t;
function run(hz, smoother) {
  const dt = 1 / hz;
  let shown = null;
  const advances = [];
  for (let t = 0; t < 8; t += dt) {
    const phase = Math.floor(t / 2) % 2; // 0: stream (delayed), 1: snapshot (latest, 10 Hz)
    let raw;
    if (phase === 0) raw = truth(t - DELAY);
    else {
      const sent = Math.floor(t / SNAPSHOT) * SNAPSHOT; // the last snapshot's time
      raw = truth(sent) + SPEED * (t - sent); // extrapolated by its age
    }
    let next;
    if (smoother === 'lerp') {
      next = shown === null ? raw : shown + (raw - shown) * (1 - Math.exp(-24 * dt));
    } else next = smoother.update([raw, 0, 0], [SPEED, 0, 0], dt)[0];
    if (shown !== null && t > 1) advances.push((next - shown) / (SPEED * dt));
    shown = next;
  }
  return {
    back: advances.filter((a) => a < 0).length,
    worst: Math.max(...advances.map((a) => Math.abs(a - 1))),
    min: Math.min(...advances),
  };
}
for (const hz of [60, 144]) {
  const old = run(hz, 'lerp'),
    now = run(hz, new PoseSmoother());
  console.log(
    `${hz} Hz  backward frames ${old.back} → ${now.back}   slowest frame ${old.min.toFixed(2)} → ${now.min.toFixed(2)}   worst deviation ${old.worst.toFixed(2)} → ${now.worst.toFixed(2)}`,
  );
  assert.ok(old.back > 0, hz + ' Hz: the old display slides backwards at the source change');
  assert.equal(now.back, 0, hz + ' Hz: the new one never goes backwards');
  assert.ok(now.min > 0.4, hz + ' Hz: and does not stall either');
}
// Steady state: no lag at all from one frame time to another.
{
  const s = new PoseSmoother();
  let last = 0,
    t = 0;
  for (let i = 0; i < 200; i++) {
    const dt = i % 7 === 0 ? 0.1 : 1 / 60;
    t += dt;
    last = s.update([truth(t), 0, 0], [SPEED, 0, 0], dt)[0] - truth(t);
  }
  assert.ok(Math.abs(last) < 1e-6, 'no lag when the target is continuous');
}
// A vehicle at rest corrected by a snapshot glides to it, whatever its direction.
{
  const s = new PoseSmoother();
  s.update([0, 0, 0], [0, 0, 0], 1 / 60);
  let p = [0, 0, 0];
  for (let i = 0; i < 120; i++) p = s.update([3, 0, 0], [0, 0, 0], 1 / 60);
  assert.ok(Math.abs(p[0] - 3) < 0.05, 'converges on a stationary target');
  s.reset();
  assert.deepEqual(s.update([9, 9, 9], [0, 0, 0], 1 / 60), [9, 9, 9], 'reset: no blending');
}
console.log('test-pose-smoother ok');
