// Display position of a vehicle driven by someone else. The target is continuous while it comes
// from one source (the pilot's interpolated stream), but jumps when the source changes (the pilot
// gets out: the server's state, which is more recent than the delayed stream; someone boards: the
// reverse) or when a server snapshot corrects an extrapolation. The old display chased the target
// with `lerp(1 − e^(−k·dt))`: it lags by an amount that depends on the frame time, and a
// backward jump of the target made the vehicle slide backwards.
//
// Here the displayed pose is the target plus an error that starts as the jump (so the vehicle
// carries on exactly as it was moving) and decays away with a time constant: no lag when nothing
// jumps, and never a recoil along the direction of travel.
export class PoseSmoother {
  /** Time constant (s) of the decay of an absorbed jump. */
  tau: number;
  private last: number[] | null = null;
  private offset = [0, 0, 0];
  constructor(tau = 0.2) {
    this.tau = tau;
  }

  /** `raw`: the target position; `v`: its velocity (same units per second). Returns the display. */
  update(raw: readonly number[], v: readonly number[], dt: number): number[] {
    const out = [0, 0, 0];
    if (!this.last) {
      this.last = [raw[0], raw[1], raw[2]];
      return [raw[0], raw[1], raw[2]];
    }
    const step = Math.max(0, dt);
    // Absorb the deviation from "the target carried on at its own velocity".
    for (let i = 0; i < 3; i++) this.offset[i] += this.last[i] + v[i] * step - raw[i];
    // Decay, but never faster along the direction of travel than half the distance covered
    // this frame: a vehicle shown ahead of its target is brought back by slowing down, not by
    // sliding backwards.
    const decay = 1 - Math.exp(-step / this.tau),
      speed = Math.hypot(v[0], v[1], v[2]);
    const d = this.offset.map((o) => o * decay);
    if (speed > 1e-9) {
      const along = (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / speed;
      const cap = 0.5 * speed * step;
      if (along > cap) for (let i = 0; i < 3; i++) d[i] -= ((along - cap) * v[i]) / speed;
    }
    for (let i = 0; i < 3; i++) {
      this.offset[i] -= d[i];
      out[i] = raw[i] + this.offset[i];
      this.last[i] = raw[i];
    }
    return out;
  }

  /** The vehicle is somewhere else now (a teleport): no blending. */
  reset(): void {
    this.last = null;
    this.offset = [0, 0, 0];
  }
}
