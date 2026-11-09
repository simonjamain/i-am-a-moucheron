import assert from 'node:assert/strict';
import { ServerClock, SNAP_MS } from '../src/server-clock.js';

// Simulated game: the server answers every 250 ms; each reply travels 20 to
// 120 ms (and 5 % of them 300 ms); the browser draws at 60 FPS. Enemy positions
// are computed from the server time used in each frame.
let seed = 3;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const OFFSET = 1_700_000_000_000; // server clock - local clock
function simulate(method) {
  const replies = [];
  for (let sent = 0; sent < 20000; sent += 250) {
    const transit = random() < 0.05 ? 300 : 20 + random() * 100;
    replies.push({ serverTime: sent + OFFSET, receivedAt: sent + transit });
  }
  replies.sort((a, b) => a.receivedAt - b.receivedAt);
  const clock = new ServerClock();
  let latest = null,
    next = 0,
    previous = null;
  const steps = [],
    errors = [];
  for (let local = 0; local < 20000; local += 1000 / 60) {
    while (next < replies.length && replies[next].receivedAt <= local) {
      latest = replies[next++];
      clock.observe(latest.serverTime, latest.receivedAt);
    }
    if (!latest) continue;
    // Former client: server time re-anchored on the latest reply.
    const serverNow =
      method === 'reanchor' ? latest.serverTime + (local - latest.receivedAt) : clock.now(local);
    if (local > 3000) {
      if (previous !== null) steps.push(serverNow - previous);
      errors.push(local + OFFSET - serverNow);
    }
    previous = serverNow;
  }
  const frame = 1000 / 60;
  return {
    backwards: steps.filter((s) => s < 0).length,
    jumps: steps.filter((s) => Math.abs(s - frame) > 4).length,
    worstStep: Math.max(...steps.map((s) => Math.abs(s - frame))),
    lag: [Math.min(...errors), Math.max(...errors)],
  };
}
const before = simulate('reanchor'),
  after = simulate('clock');
// The former method reproduces the reported "jumps": several per second.
assert.ok(
  before.jumps > 40,
  'former clock jumps several times per second: ' + JSON.stringify(before),
);
assert.ok(before.backwards > 10, 'and sometimes goes back in time');
// The smoothed clock: no backward step, no visible jump, bounded lag.
assert.equal(after.backwards, 0, 'never goes back');
assert.equal(after.jumps, 0, 'no jump above 4 ms of game time per frame');
assert.ok(after.worstStep < 1, 'step changes stay below 1 ms per frame');
assert.ok(after.lag[0] >= 15 && after.lag[1] <= 40, 'lag close to the minimum transit');

// Resynchronisation: a large offset change (tab asleep, other server) is
// applied at once; a small one is slewed without going back.
const clock = new ServerClock();
clock.observe(1000, 0);
assert.equal(clock.now(0), 1000);
clock.observe(1000 + 100 + SNAP_MS + 1, 100);
assert.equal(clock.now(100), 100 + 1000 + SNAP_MS + 1, 'large gap: resynchronised');
const slow = new ServerClock();
slow.observe(5000, 0);
slow.now(0);
for (let t = 4000; t <= 8000; t += 100) slow.observe(5000 + t - 200, t + 3000); // slower path
let last = slow.now(3000);
for (let t = 3016; t < 6000; t += 16) {
  const v = slow.now(t);
  assert.ok(v > last, 'still monotonic while slewing');
  last = v;
}
assert.equal(new ServerClock().now(5), null, 'no sample, no time');
console.log(
  'Server clock: former ' +
    JSON.stringify(before) +
    ' -> smoothed ' +
    JSON.stringify(after) +
    ' (steps and lag in ms)',
);
