import type { XYZ } from './types.ts';

// Exponential camera follow that stays put on screen when frame times vary.
//
// `position.lerp(target, 1 - exp(-k·dt))` is exact for a fixed target. A vehicle moves while the
// frame lasts, though, and the lag it leaves behind depends on dt: v·dt·e^(-k·dt)/(1 - e^(-k·dt)),
// which shrinks as dt grows. After a long frame (a garbage collection, a skipped vsync) the
// vehicle is drawn a little closer to the camera for that frame, then drops back: a small
// backwards hop of the vehicle on screen. This version solves the follow exactly for a target
// moving at `velocity` over the frame (the lag settles at v/k whatever dt is).
interface Vec3 extends XYZ {
  set(x: number, y: number, z: number): unknown;
}

/** Move `position` towards `wanted` (this frame's target, which moved at `velocity` in `dt`). */
export function followMoving(
  position: Vec3,
  wanted: XYZ,
  velocity: XYZ,
  rate: number,
  dt: number,
): void {
  const decay = Math.exp(-rate * dt),
    lag = 1 / rate;
  // Offset from the target at the start of the frame, plus the steady lag v/k, decays; the
  // target's own motion over the frame is already in `wanted`.
  const next = (c: number, w: number, v: number): number =>
    w - v * lag + (c - (w - v * dt) + v * lag) * decay;
  position.set(
    next(position.x, wanted.x, velocity.x),
    next(position.y, wanted.y, velocity.y),
    next(position.z, wanted.z, velocity.z),
  );
}
