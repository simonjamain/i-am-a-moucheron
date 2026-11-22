/**
 * What a projectile hits. A material carries the largest grazing angle (degrees, from the
 * surface: 0° is tangent) at which a projectile may still ricochet off it; src/ricochet.ts
 * takes the minimum of this and the projectile type's own limit. 0° never ricochets.
 * The list is closed and small on purpose: new materials (paper, wood, metal, glass...) are
 * added here and assigned to props without touching the ballistics. See docs/projectiles.md.
 */
export interface Material {
  readonly ricochetMaxAngle: number;
}
const material = (m: Material): Material => Object.freeze(m);

export const MATERIALS = Object.freeze({
  /** Every office prop, furniture, wall and floor until they get finer materials. */
  decor: material({ ricochetMaxAngle: 10 }),
  /** The tank's plating: any projectile may bounce, only the projectile's own limit counts. */
  armor: material({ ricochetMaxAngle: 90 }),
  /** The other vehicles. */
  hull: material({ ricochetMaxAngle: 0 }),
  /** The beetle's shell. */
  carapace: material({ ricochetMaxAngle: 12 }),
  /** Other insects and the players. */
  flesh: material({ ricochetMaxAngle: 0 }),
} satisfies Record<string, Material>);

export type MaterialId = keyof typeof MATERIALS;

/** One material per vehicle type for now: the tank is armoured, the others are not. */
export const vehicleMaterial = (type: string | undefined): MaterialId =>
  type === 'tank' ? 'armor' : 'hull';

/** The beetle ("brute" in the waves) carries a carapace; every other insect is flesh. */
export const insectMaterial = (type: string | undefined): MaterialId =>
  type === 'brute' ? 'carapace' : 'flesh';
