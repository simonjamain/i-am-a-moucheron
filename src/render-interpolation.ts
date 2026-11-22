// Render interpolation of the vehicle the player drives. The physics runs at a fixed step
// (1/120 s) inside the frame loop, but the screen shows frames at its own pace (60, 75, 144 Hz,
// with jitter): shown as it is, the last stepped pose advances by 0, 1 or 2 steps from one frame to
// the next, an irregular motion that reads as stutter. Instead the frame shows the pose between
// the last two steps, at the share of a step still left in the accumulator. The physics, the
// shots and the HUD keep reading the stepped pose: `restore` puts it back before the next step.
// Method: "Fix Your Timestep" (Gaffer On Games). Details: docs/performance.md.

/** A pose as a position and a quaternion: [x, y, z, qx, qy, qz, qw]. */
export type Pose = readonly number[];
/** What the rig owns: a position and a rotation that can be read and written as arrays. */
export interface PoseTarget {
  read(): number[];
  write(pose: Pose): void;
}
/** Beyond this distance between two steps the vehicle was teleported: no blending. */
const SNAP = 1e3;

const same = (a: Pose, b: Pose): boolean => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/** The blend of two poses: linear position, shortest-path normalised rotation. */
export function blend(a: Pose, b: Pose, t: number): number[] {
  const out = [0, 0, 0, 0, 0, 0, 1];
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  let dot = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6];
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  let n = 0;
  for (let i = 3; i < 7; i++) {
    out[i] = a[i] * (1 - t) + sign * b[i] * t;
    n += out[i] * out[i];
  }
  n = Math.sqrt(n) || 1;
  for (let i = 3; i < 7; i++) out[i] /= n;
  return out;
}

export class RenderInterpolation {
  private prev: Pose | null = null;
  private curr: Pose | null = null;
  private shown: Pose | null = null;

  /** Start of the frame: gives the stepped pose back, unless something moved the vehicle. */
  restore(target: PoseTarget): void {
    const now = target.read();
    if (this.shown && this.curr && same(now, this.shown)) target.write(this.curr);
    else this.reset();
    this.shown = null;
  }

  /** Around one physics step. */
  step(target: PoseTarget, run: () => void): void {
    const before = target.read();
    run();
    const after = target.read();
    // Teleports (a new vehicle, a respawn, a crash) are not blended.
    const far = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > SNAP;
    this.prev = far || !this.curr ? after : this.curr;
    this.curr = after;
  }

  /** End of the physics for this frame: shows the pose `alpha` (0..1) of a step past the last
   * but one. */
  show(target: PoseTarget, alpha: number): void {
    if (!this.prev || !this.curr) return;
    const pose = blend(this.prev, this.curr, Math.min(1, Math.max(0, alpha)));
    target.write(pose);
    this.shown = target.read();
  }

  reset(): void {
    this.prev = this.curr = this.shown = null;
  }
}
