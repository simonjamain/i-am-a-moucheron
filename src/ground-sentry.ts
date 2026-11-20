// Server-owned automatic defense: each accepted round costs one cartridge.
export const SENTRY = Object.freeze({
  cost: 9,
  hp: 150,
  ammo: 180,
  range: 0.42,
  intervalMs: 500,
  damage: 30,
  maxPerRoom: 12,
  // Ground footprint radius used for placement spacing (scaled T-01, #110).
  footprint: 0.02,
});

/** Server structure record (only the fields the sentry loop reads or writes). */
export interface SentryStructure {
  kind: string;
  hp: number;
  ammo: number;
  position: readonly number[];
  y?: number;
  lastShotAt?: number;
  aimTarget?: number[];
}
export interface SentryTarget {
  p: readonly number[];
  dead?: boolean;
}
export function fireGroundSentries<S extends SentryStructure, E extends SentryTarget>(
  structures: Iterable<S>,
  targets: Iterable<E | null | undefined>,
  now: number,
  hit: (target: E, sentry: S, damage: number) => void,
): number {
  let fired = 0;
  for (const sentry of structures) {
    if (
      sentry.kind !== 'sentry' ||
      sentry.hp <= 0 ||
      sentry.ammo < 1 ||
      now - (sentry.lastShotAt ?? -Infinity) < SENTRY.intervalMs
    )
      continue;
    let selected: E | null = null;
    let range: number = SENTRY.range;
    for (const target of targets) {
      if (!target || target.dead) continue;
      const [x, y, z] = target.p;
      const distance = Math.hypot(
        x - sentry.position[0],
        y - (sentry.y || 0) - 0.025,
        z - sentry.position[1],
      );
      if (distance < range) {
        selected = target;
        range = distance;
      }
    }
    if (!selected) continue;
    // Replicate only the last authoritative target for articulated client visuals.
    sentry.aimTarget = [...selected.p];
    sentry.ammo--;
    sentry.lastShotAt = now;
    hit(selected, sentry, SENTRY.damage);
    fired++;
  }
  return fired;
}
