import { HEAVY } from './armament.ts';
import { integrateOrdnance } from './ordnance.ts';
import type { HeavyKind } from './armament.ts';

/** A graduation: its range (office metres) and the trajectory point reaching it. */
export interface BallisticMark {
  metres: number;
  point: number[];
}
// Graduations in real office metres (issue #105), out to the far end of the room
// (about 9 m). Each one is sampled on the authoritative trajectory.
export const TANK_MARKS = Object.freeze([0.15, 0.3, 0.6, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9]);
export function ballisticMarks(
  weapon: string,
  direction: readonly number[] = [0, 0, -1],
  carrier: readonly number[] = [0, 0, 0],
): BallisticMark[] {
  const profile = (HEAVY as Readonly<Record<string, (typeof HEAVY)[HeavyKind] | undefined>>)[
    weapon
  ];
  if (!profile || weapon === 'bomb') return [];
  const n = Math.hypot(...direction),
    d = direction.map((v) => v / n);
  // No `weapon` on purpose: integrateOrdnance then always applies gravity and drag.
  const projectile = {
    p: [0, 0, 0],
    v: d.map((v, i) => v * profile.speed + carrier[i]),
    age: 0,
  };
  const ranges = TANK_MARKS;
  const marks: BallisticMark[] = [];
  let last = [...projectile.p];
  while (projectile.age < profile.lifetime && marks.length < ranges.length) {
    integrateOrdnance(projectile, 1 / 120);
    const along = (p: readonly number[]) => p.reduce((s, v, i) => s + v * d[i], 0);
    const a = along(last),
      b = along(projectile.p),
      range = ranges[marks.length];
    if (b >= range) {
      const t = Math.max(0, Math.min(1, (range - a) / (b - a)));
      marks.push({ metres: range, point: last.map((v, i) => v + (projectile.p[i] - v) * t) });
    }
    last = [...projectile.p];
  }
  return marks;
}
