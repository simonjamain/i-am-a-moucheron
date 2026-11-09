// Server time for animations that are computed locally from it (swarms, ground
// insects). Each reply gives a sample: server send time vs local receive time.
// Its offset is the true clock offset minus the transit delay, which varies
// from one reply to the next. Re-anchoring on every reply therefore made the
// whole swarm jump by that variation 4 to 10 times per second.
//
// This clock keeps, over a sliding window, the sample with the smallest delay
// (largest offset), and slews towards it by at most SLEW_RATE of elapsed time:
// it never goes backwards and never jumps, except to resynchronise after a
// gap larger than SNAP_MS (first reply, sleeping tab, other server).
export const CLOCK_WINDOW_MS = 6000;
export const SLEW_RATE = 0.05;
export const SNAP_MS = 500;

export class ServerClock {
  constructor({ window = CLOCK_WINDOW_MS, slew = SLEW_RATE, snap = SNAP_MS } = {}) {
    this.window = window;
    this.slew = slew;
    this.snap = snap;
    this.samples = [];
    this.offset = null;
    this.last = null;
  }
  // serverTime: server clock when the reply was sent (ms); local: performance.now() at receipt.
  observe(serverTime, local) {
    if (!Number.isFinite(serverTime) || !Number.isFinite(local)) return;
    this.samples.push({ local, offset: serverTime - local });
    while (this.samples.length > 1 && this.samples[0].local < local - this.window)
      this.samples.shift();
    if (this.samples.length > 256) this.samples.shift();
  }
  target() {
    let best = -Infinity;
    for (const s of this.samples) if (s.offset > best) best = s.offset;
    return best;
  }
  // Server time at local time `local`, monotonic between successive calls.
  now(local) {
    if (!this.samples.length) return null;
    const target = this.target();
    if (this.offset === null || Math.abs(target - this.offset) > this.snap) this.offset = target;
    else if (this.last !== null) {
      const step = Math.max(0, local - this.last) * this.slew;
      this.offset += Math.max(-step, Math.min(step, target - this.offset));
    }
    this.last = local;
    return local + this.offset;
  }
  reset() {
    this.samples = [];
    this.offset = null;
    this.last = null;
  }
}
