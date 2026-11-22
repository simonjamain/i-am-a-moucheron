import { FLAK, REFERENCE } from './scale.ts';

/**
 * What a projectile *is*, independently of the weapon that fires it: its damage,
 * nominal speed, flight (drag, lifetime), blast and look. Weapons reference a type
 * and keep only what belongs to the weapon (rate of fire, ammunition, recoil, and a
 * `speedFactor` for a longer or shorter barrel). Distances are reference metres.
 * See docs/projectiles.md.
 */
export interface ProjectileType {
  /** Damage on a direct hit (at the centre of a blast). */
  readonly damage: number;
  /** Damage at the edge of the blast; 0 for a bullet. */
  readonly edge: number;
  /** Blast radius in reference metres; 0 when the projectile does not explode. */
  readonly radius: number;
  /** Nominal muzzle speed in reference m/s (a weapon scales it by its `speedFactor`). */
  readonly speed: number;
  /** Seconds in flight before the projectile ends. */
  readonly lifetime: number;
  /** Quadratic drag law of the flight: bullet, shell, or none (bomb, missile). */
  readonly drag: 'bullet' | 'shell' | null;
  /**
   * How much the damage follows the muzzle speed: damage = damage × (speed / nominal) ^ exponent.
   * 1 for a bullet (kinetic), 0 for a bomb or an explosive shell (the blast does not care).
   */
  readonly speedExponent: number;
  /** Largest grazing angle (degrees from the surface) at which it may ricochet; 0 never. */
  readonly ricochetMaxAngle: number;
  /** Neutral colour of the shell body, identical for every player; bullets use the tracer. */
  readonly color?: string;
}

const type = (t: ProjectileType): ProjectileType => Object.freeze(t);

export const PROJECTILES = Object.freeze({
  // Machine-gun bullets: one family, damage differs by gun until harmonised.
  /** Fighter and helicopter guns, tank top gun (75). */
  mg: type({
    damage: 75,
    edge: 0,
    radius: 0,
    speed: REFERENCE.bullet,
    lifetime: 3,
    drag: 'bullet',
    ricochetMaxAngle: 20,
    speedExponent: 1,
  }),
  /** Tank driver's machine gun (33). */
  mgLight: type({
    damage: 33,
    edge: 0,
    radius: 0,
    speed: REFERENCE.bullet,
    lifetime: 3,
    drag: 'bullet',
    ricochetMaxAngle: 20,
    speedExponent: 1,
  }),
  /** Tank coaxial gun (50). */
  coax: type({
    damage: 50,
    edge: 0,
    radius: 0,
    speed: REFERENCE.bullet,
    lifetime: 3,
    drag: 'bullet',
    ricochetMaxAngle: 20,
    speedExponent: 1,
  }),
  /** Castor driver's gun (40). */
  castorGun: type({
    damage: 40,
    edge: 0,
    radius: 0,
    speed: REFERENCE.bullet,
    lifetime: 3,
    drag: 'bullet',
    ricochetMaxAngle: 20,
    speedExponent: 1,
  }),
  /** Round of the high-rate DCA (62). */
  rapidDca: type({
    damage: 62,
    edge: 0,
    radius: 0,
    speed: REFERENCE.bullet,
    lifetime: 3,
    drag: 'bullet',
    ricochetMaxAngle: 20,
    speedExponent: 1,
  }),
  // Shells fused in the air or on contact.
  /** Light flak shell (fixed DCA and mobile AA tracer round): direct hit 200, blast at its fuse. */
  flak: type({
    damage: 200,
    edge: 0,
    radius: FLAK.lightRadius,
    speed: REFERENCE.shell,
    lifetime: 4.5,
    drag: 'shell',
    ricochetMaxAngle: 0,
    speedExponent: 0,
  }),
  // Heavy ordnance, simulated by its shooter (src/heavy-sim.js).
  rocket: type({
    damage: 120,
    edge: 30,
    radius: 12,
    speed: 180,
    lifetime: 9,
    drag: null,
    ricochetMaxAngle: 0,
    speedExponent: 0,
    color: '#e0a33c',
  }),
  missile: type({
    damage: 360,
    edge: 70,
    radius: 30,
    speed: 100,
    lifetime: 15,
    drag: null,
    ricochetMaxAngle: 0,
    speedExponent: 0,
    color: '#e6e1cf',
  }),
  /** Mobile AA shell: same blast as the fixed light flak. */
  proximity: type({
    damage: 80,
    edge: 20,
    radius: FLAK.lightRadius,
    speed: REFERENCE.shell * 0.7,
    lifetime: 9,
    drag: 'shell',
    ricochetMaxAngle: 0,
    speedExponent: 0,
  }),
  dcaHeavy: type({
    damage: 240,
    edge: 60,
    radius: 40,
    speed: REFERENCE.shell * 0.7,
    lifetime: 9,
    drag: 'shell',
    ricochetMaxAngle: 0,
    speedExponent: 0,
    color: '#e0a33c',
  }),
  bomb: type({
    damage: 240,
    edge: 60,
    radius: 20,
    speed: 0,
    lifetime: 52.5,
    drag: null,
    ricochetMaxAngle: 0,
    speedExponent: 0,
  }),
  /** Tank high-explosive shell; long enough to cross the whole office (issue #103). */
  he: type({
    damage: 320,
    edge: 30,
    radius: 20,
    speed: 320,
    lifetime: 19.5,
    drag: 'shell',
    ricochetMaxAngle: 5,
    speedExponent: 0,
    color: '#e0a33c',
  }),
  /** Armour-piercing shell: no blast, pierces enemies (AP_PIERCE_KEEP). */
  ap: type({
    damage: 800,
    edge: 0,
    radius: 0,
    speed: 600,
    lifetime: 12,
    drag: 'shell',
    ricochetMaxAngle: 10,
    speedExponent: 1,
    color: '#cfd6dc',
  }),
  /** Fixed anti-materiel howitzer shell (#113). */
  antitank: type({
    damage: 800,
    edge: 90,
    radius: 5,
    speed: 750,
    lifetime: 12,
    drag: 'shell',
    ricochetMaxAngle: 0,
    speedExponent: 0,
    color: '#d9b45a',
  }),
} satisfies Record<string, ProjectileType>);

export type ProjectileId = keyof typeof PROJECTILES;

/** Damage of a projectile leaving the barrel at `speed` (reference m/s): follows speed by the type's exponent. */
export function projectileDamage(id: ProjectileId, speed: number = PROJECTILES[id].speed): number {
  const projectile = PROJECTILES[id];
  if (projectile.speedExponent === 0 || projectile.speed <= 0) return projectile.damage;
  return (
    projectile.damage * Math.pow(Math.max(0, speed) / projectile.speed, projectile.speedExponent)
  );
}
