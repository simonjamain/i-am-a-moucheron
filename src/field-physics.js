import { MAP } from './scale.js';
// Human reference physics converted to the current world ratio.
export const WALKER_FALL = Object.freeze({
  gravity: 9.81 * MAP.ratio,
  terminal: 54 * MAP.ratio,
  canopyTerminal: 5.5 * MAP.ratio,
  inflationSeconds: 0.25,
  brake: 24 * MAP.ratio,
  safeImpact: 6 * MAP.ratio,
  fatalImpact: 20 * MAP.ratio,
});
export function impactDamage(speed) {
  const { safeImpact, fatalImpact } = WALKER_FALL;
  return speed <= safeImpact
    ? 0
    : speed >= fatalImpact
      ? 100
      : Math.ceil(100 * ((speed - safeImpact) / (fatalImpact - safeImpact)) ** 2);
}
export function stepWalkerFall(body, dt) {
  const n = Math.max(1, Math.ceil(dt * 240)),
    h = dt / n,
    f = WALKER_FALL;
  for (let i = 0; i < n; i++) {
    body.canopyInflation = Math.max(
      0,
      Math.min(
        1,
        (body.canopyInflation || 0) + ((body.parachute ? 1 : -2) * h) / f.inflationSeconds,
      ),
    );
    const v = body.vy,
      free = Math.max(
        -f.gravity,
        Math.min(f.brake, -f.gravity * (1 - (Math.min(0, v) / f.terminal) ** 2)),
      ),
      brake = Math.max(-f.gravity, Math.min(f.brake, (-f.canopyTerminal - v) * 12)),
      next = v + (free * (1 - body.canopyInflation) + brake * body.canopyInflation) * h;
    body.y += ((v + next) * h) / 2;
    body.vy = next;
  }
}
