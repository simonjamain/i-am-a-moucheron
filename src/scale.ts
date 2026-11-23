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
/** A person is 1.8 reference metres tall; the humanoid model is 2.46 of its own units. */
export const PERSON_HEIGHT = 1.8;
export const HUMANOID_UNITS = 2.46;
export const HUMAN_SCALE = MAP.metres(PERSON_HEIGHT / HUMANOID_UNITS);
/**
 * Walking collision radius of a person, in reference metres, the same in every
 * world (issue #135 halved it; the purgatory's 0.24 units for a 2.46-unit person).
 */
export const WALKER_RADIUS = (0.24 * PERSON_HEIGHT) / HUMANOID_UNITS;
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
// Hit-volume tolerance of the flyers (multiplies their hit radii). The midge's
// sphere was 1.2 and is 30 % smaller (0.84); the bee, mosquito and beetle,
// which were 1, are 30 % larger (1.3). The sphere is normalised by 1.2.
export const MIDGE_HIT_TOLERANCE = 1.2 * 0.7;
export const FLYER_HIT_TOLERANCE = 1.3;
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
  // Default blast radius; the light flak and the mobile AA shell share `lightRadius`.
  radius: 8,
  // Blast radius of the light flak's and mobile AA's shell (m), damage falling off to its edge.
  lightRadius: 30,
});

// Directions are relative to the gun's vertical axis, including the D2 hull.
export function flakPitchAllowed(direction: readonly number[]): boolean {
  return direction[1] >= Math.hypot(...direction) * (Math.sin(FLAK.minPitch) - 1e-8);
}

/**
 * A world where people walk (office, purgatories). Everything about a walker —
 * model size, camera framing, acceleration, gait — derives from these two
 * numbers, so a person walks, runs and is filmed the same way in every world.
 */
export interface WalkWorld {
  /** Scene units per reference metre (model size, camera distances). */
  readonly sceneScale: number;
  /** Reference metres per arena unit (body positions and speeds). */
  readonly arenaMetres: number;
  /** The arena z axis points opposite to the scene's (office). */
  readonly mirrorZ: boolean;
}
export const WALK_WORLDS: Readonly<Record<'office' | 'purgatory', WalkWorld>> = Object.freeze({
  office: Object.freeze({
    sceneScale: MAP.ratio,
    arenaMetres: ACTOR_UNIT / MAP.ratio,
    mirrorZ: true,
  }),
  // Saint Pierre's cloud lies in the same world (src/arena-frame.ts); only its
  // arena keeps the humanoid's own units for the queue's rules.
  purgatory: Object.freeze({
    sceneScale: MAP.ratio,
    arenaMetres: PERSON_HEIGHT / HUMANOID_UNITS,
    mirrorZ: false,
  }),
});
/** Scale of the humanoid model in a world (1.8 m tall). */
export function humanoidScale(world: WalkWorld): number {
  return (world.sceneScale * PERSON_HEIGHT) / HUMANOID_UNITS;
}
/**
 * Walking acceleration in arena units/s²: with the arena drag (7/s) the walker
 * settles near the 6 m/s reference run (about 6.4 m/s) in every world.
 */
export function walkAcceleration(world: WalkWorld): number {
  return (REFERENCE.walk / world.arenaMetres) * 7.45;
}
/** Ground speed of an arena body in reference m/s (drives the gait). */
export function walkSpeed(world: WalkWorld, body: { vx?: number; vz?: number }): number {
  return Math.hypot(body.vx || 0, body.vz || 0) * world.arenaMetres;
}
