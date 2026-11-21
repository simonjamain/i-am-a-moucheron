// Server-owned automatic defense: each accepted round costs one cartridge.
export const SENTRY = Object.freeze({
  cost: 9,
  hp: 150,
  ammo: 180,
  range: 0.42,
  intervalMs: 500,
  damage: 30,
  // Shared by every automatic turret kind (T-01 and Gatling together).
  maxPerRoom: 12,
  // Ground footprint radius used for placement spacing (scaled T-01, #110).
  footprint: 0.02,
});

// Gatling: same behaviour and range as the T-01, 6 rounds/s from a 1000-round belt.
export const GATLING = Object.freeze({
  cost: 25,
  hp: 150,
  ammo: 1000,
  range: SENTRY.range,
  intervalMs: 1000 / 6,
  damage: 30,
  footprint: 0.02,
});

export type TurretKind = 'sentry' | 'gatling';
interface TurretSpec {
  readonly cost: number;
  readonly hp: number;
  readonly ammo: number;
  readonly range: number;
  readonly intervalMs: number;
  readonly damage: number;
  readonly footprint: number;
}
export const TURRET_KINDS: readonly TurretKind[] = Object.freeze(['sentry', 'gatling']);
export const isTurret = (kind: unknown): kind is TurretKind =>
  kind === 'sentry' || kind === 'gatling';
export const turretSpec = (kind: TurretKind): TurretSpec => (kind === 'gatling' ? GATLING : SENTRY);

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

// The server advances rooms every 250 ms and on commands: a turret idle longer
// than this restarts with a single round instead of catching up a burst.
const IDLE_RESTART_MS = 500;

function pickTarget<E extends SentryTarget>(
  sentry: SentryStructure,
  spec: TurretSpec,
  targets: readonly (E | null | undefined)[],
): E | null {
  let selected: E | null = null;
  let range: number = spec.range;
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
  return selected;
}

// Rounds a turret owes at `now`. The T-01 keeps its historic "one round, then
// wait" cadence; the Gatling keeps an exact schedule so 6 rounds/s survive the
// coarse server tick (a tick may owe two rounds).
function dueShots(sentry: SentryStructure, spec: TurretSpec, now: number): number {
  const elapsed = now - (sentry.lastShotAt ?? -Infinity);
  if (elapsed < spec.intervalMs) return 0;
  if (sentry.kind !== 'gatling' || elapsed > IDLE_RESTART_MS) return 1;
  // The epsilon absorbs 333.33 / 166.67 = 1.9999… so no round is lost to float error.
  return Math.floor(elapsed / spec.intervalMs + 1e-6);
}

export function fireGroundSentries<S extends SentryStructure, E extends SentryTarget>(
  structures: Iterable<S>,
  targets: Iterable<E | null | undefined>,
  now: number,
  hit: (target: E, sentry: S, damage: number) => void,
): number {
  const list = [...targets];
  let fired = 0;
  for (const sentry of structures) {
    if (!isTurret(sentry.kind) || sentry.hp <= 0 || sentry.ammo < 1) continue;
    const spec = turretSpec(sentry.kind);
    const owed = dueShots(sentry, spec, now);
    if (!owed) continue;
    let shots = 0;
    for (; shots < owed && sentry.ammo >= 1; shots++) {
      const selected = pickTarget(sentry, spec, list);
      if (!selected) break;
      // Replicate only the last authoritative target for articulated client visuals.
      sentry.aimTarget = [...selected.p];
      sentry.ammo--;
      hit(selected, sentry, spec.damage);
      fired++;
    }
    if (!shots) continue;
    // Gatling: advance on the schedule (no drift) unless it just restarted.
    sentry.lastShotAt =
      sentry.kind === 'gatling' && now - (sentry.lastShotAt ?? -Infinity) <= IDLE_RESTART_MS
        ? (sentry.lastShotAt ?? now) + shots * spec.intervalMs
        : now;
  }
  return fired;
}
