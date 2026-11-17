import type { EnemyType } from './types.ts';

export interface MapScale {
  readonly numerator: number;
  readonly denominator: number;
  /** Office metres per reference metre. */
  readonly ratio: number;
  /** Reference (real-world) metres → office metres. */
  metres(v: number): number;
  /** Office metres → reference metres. */
  reference(v: number): number;
}
// The room is modelled in SI metres. Actor reference dimensions/speeds are
// multiplied by this map ratio, never by a second furniture enlargement.
export function mapScale(numerator: number, denominator = 1000): MapScale {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0 ||
    numerator > denominator
  )
    throw Error('Invalid map scale');
  const ratio = numerator / denominator;
  return Object.freeze({
    numerator,
    denominator,
    ratio,
    metres: (v: number) => v * ratio,
    reference: (v: number) => v / ratio,
  });
}
export const MAPS = Object.freeze({ office: mapScale(3, 1000), purgatory: mapScale(1000, 1000) });
export const MAP = MAPS.office;
export const ACTOR_UNIT = MAP.metres(10.4 / 5.6);
export const HUMAN_SCALE = MAP.metres(1.8 / 2.46);
export const MIDGE_SIZE_FACTOR = 1.35 * 1.5 * 3;
// Office presentation/hit geometry factors. Keep wave budget/HP independent.
export const ENEMY_SIZE_FACTORS: Readonly<Record<EnemyType, number>> = Object.freeze({
  ant: 6,
  roach: 8,
  midge: MIDGE_SIZE_FACTOR,
  // Bee, beetle and mosquito: set from their in-game height (Meshy models at
  // rest, wings included): 15, 17 and 12 mm in the office (version 318).
  guard: 5.265,
  brute: 3.559,
  mosquito: 7.368,
  rat: 8,
  spider: 6,
  spiderling: 5,
});
export const enemySizeFactor = (type: string): number => ENEMY_SIZE_FACTORS[type as EnemyType] ?? 1;
export const GROUND_LEGS = Object.freeze({ y: -0.25, length: 0.65, thickness: 0.035, tilt: 0.3 });
export const GROUND_FOOT_DEPTH =
  -GROUND_LEGS.y +
  (GROUND_LEGS.length * Math.sin(GROUND_LEGS.tilt)) / 2 +
  (GROUND_LEGS.thickness * Math.cos(GROUND_LEGS.tilt)) / 2;
// Rigged ground walkers keep their feet this far above the lift.
export const GROUND_FOOT_CLEARANCE = 0.04;
export const INSECT_SCALE = MAP.metres(0.9 / 1.6);
// Radius in unscaled midge-model coordinates; used by hitscan and the GPU batch.
export const MIDGE_SPHERE_RADIUS = 1.5;
export const REFERENCE = Object.freeze({
  walk: 6,
  enemy: 60 / 3.6,
  bullet: 820,
  shell: 800,
  parachute: 5.5,
  gravity: 9.81,
});
export const FLAK = Object.freeze({
  minPitch: Math.PI / 36,
  maxPitch: Math.PI / 2,
  interval: 0.7,
  minRange: 100,
  maxRange: 1200,
  step: 25,
  range: 300,
  radius: 8,
});

// Directions are relative to the gun's vertical axis, including the D2 hull.
export function flakPitchAllowed(direction: readonly number[]): boolean {
  return direction[1] >= Math.hypot(...direction) * (Math.sin(FLAK.minPitch) - 1e-8);
}
