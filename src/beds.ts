import { VEHICLES } from './fleet.ts';
import { MAP, ACTOR_UNIT } from './scale.ts';
import { OFFICE_LAYOUT } from './layout.ts';
import { supportedPlacement } from './equipment.ts';
import type { OccupiedSpot, PlacementPoint } from './equipment.ts';
import type { Collider } from './oriented-collider.ts';
import type { VehicleType } from './fleet.ts';
import type { Vec3Like, XYZ } from './types.ts';

/** A placed bed (or any installation entry, the bed being one of them). */
export interface BedSpot extends OccupiedSpot {
  angle?: number;
}
/** The vehicle fields read when beds check for blocking parked vehicles. */
export interface BedVehicle {
  type: VehicleType;
  state: { p: Vec3Like; hp: number };
}
/** Spawn body next to a bed, in actor units relative to the base origin. */
export interface BedSpawn {
  x: number;
  z: number;
  y: number;
  airborne: boolean;
  vy: number;
  vx: number;
  vz: number;
  parachute: boolean;
}
export function bedAccess(point: XYZ | null | undefined, bed: XYZ): boolean {
  return (
    !!point &&
    Math.abs(point.y - bed.y) < MAP.metres(2) &&
    Math.hypot(point.x - bed.x, point.z - bed.z) < MAP.metres(4)
  );
}
export function bedSpawn(
  bed: BedSpot | null | undefined,
  solids: readonly Collider[],
  equipment: readonly BedSpot[],
  vehicles: readonly BedVehicle[] = [],
): BedSpawn | null {
  if (!bed) return null;
  const supported = supportedPlacement(
    bed as PlacementPoint,
    solids,
    [
      ...equipment.filter((e) => e !== bed),
      ...vehicles
        .filter((v) => v.state.hp > 0)
        .map((v) => ({
          x: v.state.p[0],
          y: v.state.p[1],
          z: v.state.p[2],
          clearance: (VEHICLES[v.type].span * ACTOR_UNIT) / 2,
        })),
    ],
    'bed',
  );
  if (!supported || Math.abs(supported.y - bed.y) > 0.0003) return null;
  const angle = Number.isFinite(bed.angle) ? (bed.angle as number) : 0,
    offset = MAP.metres(2.6);
  return {
    x: (bed.x + Math.cos(angle) * offset - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - bed.z + Math.sin(angle) * offset) / ACTOR_UNIT,
    y: bed.y,
    airborne: false,
    vy: 0,
    vx: 0,
    vz: 0,
    parachute: false,
  };
}
