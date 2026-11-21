import { MAP } from './scale.ts';
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
/** Walker body integrated by stepWalkerFall (office metres, m/s). */
export interface WalkerBody {
  y: number;
  vy: number;
  parachute?: boolean;
  canopyInflation?: number;
}
export function impactDamage(speed: number): number {
  const { safeImpact, fatalImpact } = WALKER_FALL;
  return speed <= safeImpact
    ? 0
    : speed >= fatalImpact
      ? 100
      : Math.ceil(100 * ((speed - safeImpact) / (fatalImpact - safeImpact)) ** 2);
}
export function stepWalkerFall(body: WalkerBody, dt: number): void {
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
      inflation = body.canopyInflation,
      next = v + (free * (1 - inflation) + brake * inflation) * h;
    body.y += ((v + next) * h) / 2;
    body.vy = next;
  }
}
