import { VEHICLES } from './fleet.js';
import { MAP, ACTOR_UNIT } from './scale.js';
import { OFFICE_LAYOUT } from './layout.js';
import { supportedPlacement } from './equipment.js';
export function bedAccess(point, bed) {
  return (
    !!point &&
    Math.abs(point.y - bed.y) < MAP.metres(2) &&
    Math.hypot(point.x - bed.x, point.z - bed.z) < MAP.metres(4)
  );
}
export function bedSpawn(bed, solids, equipment, vehicles = []) {
  if (!bed) return null;
  const supported = supportedPlacement(
    bed,
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
  return {
    x: (bed.x + MAP.metres(1.6) - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - bed.z) / ACTOR_UNIT,
    y: bed.y,
    airborne: false,
    vy: 0,
    vx: 0,
    vz: 0,
    parachute: false,
  };
}
