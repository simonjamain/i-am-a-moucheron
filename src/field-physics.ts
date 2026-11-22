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
/** The jump: take-off speed in reference m/s (apex about 1.2 m); scaled by the world's units. */
export const WALKER_JUMP_SPEED = 4.9;
/**
 * Descent speed (reference m/s) from which a fall is a fall: the free-fall pose, free-fall air
 * rules, and the canopy may open. A jump comes back down slower than this.
 */
export const WALKER_FREEFALL_SPEED = 5.6;
/** Walker body integrated by stepWalkerFall (office metres, m/s). */
export interface WalkerBody {
  y: number;
  vy: number;
  parachute?: boolean;
  canopyInflation?: number;
}
/**
 * Starts a jump: only from the ground, with no canopy out. `scale` is scene units per reference
 * metre (WALK_WORLDS[...].sceneScale). Returns false when the walker cannot jump now.
 */
export function jumpWalker(
  body: WalkerBody & { grounded?: boolean },
  scale: number = MAP.ratio,
): boolean {
  if (!body || body.grounded === false || body.parachute) return false;
  body.vy = WALKER_JUMP_SPEED * scale;
  body.grounded = false;
  return true;
}
/**
 * The jump on a flat floor at height `floor` (the purgatory has no relief): rise, fall, land. The
 * office walker does the same in stepWalker, on the real surfaces under it.
 */
export function stepFlatJump(
  body: WalkerBody & { grounded?: boolean },
  dt: number,
  scale: number,
  floor = 0,
): void {
  if (body.grounded !== false) return;
  const n = Math.max(1, Math.ceil(dt * 240)),
    h = dt / n;
  body.y ??= floor;
  for (let i = 0; i < n; i++) {
    const next = body.vy - 9.81 * scale * h;
    body.y += ((body.vy + next) * h) / 2;
    body.vy = next;
    if (body.y <= floor) {
      body.y = floor;
      body.vy = 0;
      body.grounded = true;
      return;
    }
  }
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
