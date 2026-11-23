// What a shot can hit in Saint Pierre's sky (docs/purgatory-sky.md): the insects'
// souls of the queue, and Saint Pierre and the VIP guard (at their posts, or as
// souls in the queue once killed). Each target is a sphere in the world (office
// metres); the client reports hits with the 'purgatory-hit' command.
import { blastDamage } from './combat.ts';

export type Vec3 = readonly [number, number, number];
export interface SkyTarget {
  /** 'soul': a soul of the queue (key: its id); 'staff': Saint Pierre or the guard at his post. */
  kind: 'soul' | 'staff';
  key: number | string;
  center: Vec3;
  radius: number;
  /** Saint Pierre's or the guard's: hurt by the damage (an insect's soul is freed by any hit). */
  staff: boolean;
}
/** A hit reported to the server: [kind, key, damage]. */
export type SkyHit = [SkyTarget['kind'], SkyTarget['key'], number];

/** Distance along a ray (unit `dir`) to a sphere, within `far`, or null. */
export function raySphere(
  origin: Vec3,
  dir: Vec3,
  far: number,
  center: Vec3,
  radius: number,
): number | null {
  const ox = origin[0] - center[0],
    oy = origin[1] - center[1],
    oz = origin[2] - center[2];
  const b = ox * dir[0] + oy * dir[1] + oz * dir[2],
    c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (b > 0 || disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= far ? t : null;
}
/** Nearest target along a bullet's step, within `far`. */
export function nearestSkyTarget(
  targets: readonly SkyTarget[],
  origin: Vec3,
  dir: Vec3,
  far: number,
): { target: SkyTarget; distance: number } | null {
  let best: { target: SkyTarget; distance: number } | null = null;
  for (const target of targets) {
    const d = raySphere(origin, dir, best?.distance ?? far, target.center, target.radius);
    if (d !== null && (!best || d < best.distance)) best = { target, distance: d };
  }
  return best;
}
/** Hits of a blast at `point`: the usual blast damage, falling off to its edge. */
export function skyBlast(targets: readonly SkyTarget[], point: Vec3, radius: number): SkyHit[] {
  const hits: SkyHit[] = [];
  for (const t of targets) {
    const d = Math.max(
      0,
      Math.hypot(t.center[0] - point[0], t.center[1] - point[1], t.center[2] - point[2]) - t.radius,
    );
    const damage = blastDamage(d, radius);
    if (damage > 0) hits.push([t.kind, t.key, damage]);
  }
  return hits;
}
