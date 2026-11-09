import assert from 'node:assert/strict';
import { MotionTrack, MOTION_DELAY_MAX_MS } from '../src/network.js';

// A remote aircraft flies a circle at 5 units/s. Its browser sends at 20 Hz
// (10 Hz relayed in big rooms); the network adds 20-120 ms, 5 % at 300 ms, and
// loses 5 %. The receiver draws at 60 FPS. A "jump" is a frame whose step
// differs from the true step by more than 50 % (0.04 units).
function simulate({ hz, captured, senderClock = 12345 }) {
  let seed = 11;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const truth = (t) => [Math.cos(t / 3000) * 15, 5, Math.sin(t / 3000) * 15];
  const velocity = (t) => [-Math.sin(t / 3000) * 5, 0, Math.cos(t / 3000) * 5];
  const packets = [];
  let seq = 0;
  for (let t = 0; t < 20000; t += 1000 / hz) {
    seq++;
    if (random() < 0.05) continue;
    packets.push({ sent: t, arrive: t + (random() < 0.05 ? 300 : 20 + random() * 100), seq });
  }
  packets.sort((a, b) => a.arrive - b.arrive);
  const track = new MotionTrack();
  let next = 0,
    previous = null,
    previousAt = 0;
  const errors = [],
    delays = [];
  let extrapolated = 0;
  for (let now = 0; now < 20000; now += 1000 / 60) {
    while (next < packets.length && packets[next].arrive <= now) {
      const p = packets[next++];
      track.push(
        {
          p: truth(p.sent),
          q: [0, 0, 0, 1],
          v: velocity(p.sent),
          hp: 100,
          wing: 1,
          engine: 1,
          fire: false,
        },
        p.arrive,
        p.seq,
        'rtc',
        captured ? p.sent + senderClock : undefined,
      );
    }
    const state = track.sample(now);
    if (!state || now < 3000) continue;
    const delay = track.displayDelay(now);
    delays.push(delay);
    if (track.samples.at(-1).time < now - delay) extrapolated++;
    if (previous) {
      const step = Math.hypot(...state.p.map((v, i) => v - previous[i]));
      errors.push(Math.abs(step - (5 * (now - previousAt)) / 1000));
    }
    previous = state.p;
    previousAt = now;
  }
  return {
    jumps: errors.filter((e) => e > 0.04).length,
    worst: +Math.max(...errors).toFixed(3),
    extrapolated,
    delay: [Math.round(Math.min(...delays)), Math.round(Math.max(...delays))],
  };
}
const results = {};
for (const hz of [20, 10]) {
  const before = simulate({ hz, captured: false }),
    after = simulate({ hz, captured: true });
  results[hz + ' Hz'] = { before, after };
  assert.ok(before.jumps > 100, hz + ' Hz: arrival-time sampling reproduces the jumps');
  assert.equal(after.jumps, 0, hz + ' Hz: no jump with capture times');
  assert.ok(after.worst < 0.02, hz + ' Hz: frame steps follow the true path');
  assert.ok(after.extrapolated < before.extrapolated, hz + ' Hz: less extrapolation');
  assert.ok(after.delay[1] <= MOTION_DELAY_MAX_MS, hz + ' Hz: bounded display delay');
}
// Any sender clock works: only differences of capture times matter.
assert.equal(simulate({ hz: 20, captured: true, senderClock: -9e8 }).jumps, 0);
// Without capture times (older peer, snapshot fallback), the former delay stays.
const legacy = new MotionTrack();
legacy.push(
  { p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], hp: 100, wing: 1, engine: 1, fire: false },
  0,
  1,
  'rtc',
);
assert.equal(legacy.displayDelay(10), 100);
console.log(
  'Motion smoothing (circle at 5 units/s, 5 % loss, 20-300 ms transit): ' + JSON.stringify(results),
);
