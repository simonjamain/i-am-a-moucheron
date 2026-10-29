// World SI metres, independent of the miniature mesh ratio.
export const WALKER_FALL = Object.freeze({
  gravity: 9.81,
  terminal: 6,
  canopyTerminal: 0.045,
  inflationSeconds: 0.25,
  brake: 24,
  safeImpact: 0.6,
  fatalImpact: 2,
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
      free = -f.gravity * (1 - Math.min(1, (Math.min(0, v) / f.terminal) ** 2)),
      brake = Math.max(-f.gravity, Math.min(f.brake, (-f.canopyTerminal - v) * 12)),
      next = Math.max(
        -f.terminal,
        v + (free * (1 - body.canopyInflation) + brake * body.canopyInflation) * h,
      );
    body.y += ((v + next) * h) / 2;
    body.vy = next;
  }
}
