import { MATERIALS, type MaterialId } from './materials.ts';
import { PROJECTILES, type ProjectileId } from './projectiles.ts';

/** A projectile ricochets at most this many times; the next eligible contact ends it harmlessly. */
export const MAX_BOUNCES = 5;
/** Share of its speed a projectile loses at the limit angle (none when perfectly grazing). */
export const SPEED_LOSS = 0.6;

type Vec = readonly [number, number, number];

/** Angle in degrees between a trajectory and the surface it meets: 0 grazing, 90 head-on. */
export function grazingAngle(direction: Vec, normal: Vec): number {
  const dl = Math.hypot(...direction),
    nl = Math.hypot(...normal);
  if (dl < 1e-12 || nl < 1e-12) return 90;
  const sine = Math.abs(
    (direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]) / (dl * nl),
  );
  return (Math.asin(Math.min(1, sine)) * 180) / Math.PI;
}

/** Largest grazing angle that still ricochets: the smaller limit of the projectile and the material. */
export function ricochetLimit(projectile: ProjectileId, material: MaterialId): number {
  return Math.min(PROJECTILES[projectile].ricochetMaxAngle, MATERIALS[material].ricochetMaxAngle);
}

export type Bounce =
  /** Perfect reflection; `speedFactor` of the speed is kept. No damage is done. */
  | { kind: 'ricochet'; direction: [number, number, number]; speedFactor: number; angle: number }
  /** The sixth eligible contact: the projectile stops, still without damage. */
  | { kind: 'spent'; angle: number };

/**
 * Decides what a contact does: a ricochet, a harmless stop after MAX_BOUNCES, or `null` when
 * the projectile hits (damage, as before). `bounces` counts the ricochets already made.
 */
export function bounce(
  direction: Vec,
  normal: Vec,
  projectile: ProjectileId,
  material: MaterialId,
  bounces: number,
): Bounce | null {
  const limit = ricochetLimit(projectile, material);
  if (limit <= 0) return null;
  const angle = grazingAngle(direction, normal);
  if (angle > limit) return null;
  if (bounces >= MAX_BOUNCES) return { kind: 'spent', angle };
  const nl = Math.hypot(...normal),
    n = [normal[0] / nl, normal[1] / nl, normal[2] / nl] as const,
    d = (direction[0] * n[0] + direction[1] * n[1] + direction[2] * n[2]) * 2;
  const out: [number, number, number] = [
    direction[0] - d * n[0],
    direction[1] - d * n[1],
    direction[2] - d * n[2],
  ];
  return { kind: 'ricochet', direction: out, speedFactor: 1 - SPEED_LOSS * (angle / limit), angle };
}
