import { vehicleEntry, EXIT_LIFT, VEHICLES, type VehicleRef } from './fleet.ts';
import type { FootprintQuery } from './equipment.ts';
import { MAP, PERSON_HEIGHT, WALKER_RADIUS } from './scale.ts';
import type { XYZ } from './types.ts';

// Where a player appears when leaving a vehicle that stands still on the ground. The door is
// the natural spot, but a vehicle parked on a desk or beside a prop can have a monitor, a lamp or
// a box at its door (the player then appeared inside it and could not walk out), or the desk's
// edge (the player dropped to the floor). The door is kept when a person can stand there;
// otherwise the nearest free spot around the vehicle, searched from the door outwards.

/** The decor's standing queries (office-collision.ts `DecorCollision`). */
export interface ExitDecor {
  /** Height of a flat decor surface under the footprint (just below `q.y`), or null. */
  surface(q: FootprintQuery): number | null;
  /** True when no decor lies in the footprint's headroom above `y`. */
  clear(q: FootprintQuery, y: number): boolean;
}
export interface ExitSpot extends XYZ {
  /** A person can stand there; false: nothing free was found, the door is returned as it was. */
  free: boolean;
}

/** Room left around the body, as a multiple of the walking radius. */
const BODY_MARGIN = 1.5;
/** Distances beyond the door tried, in reference metres, then the directions (degrees from the door). */
const EXTRA_DISTANCES = [0, 1, 2, 3.5, 5];
const ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];
/** A vehicle this close to the floor (reference metres) stands on the floor, not on a prop. */
const FLOOR_TOLERANCE = 0.5;

export function exitSpot(
  vehicle: VehicleRef,
  seat: string,
  decor: ExitDecor | null | undefined,
): ExitSpot {
  const door = vehicleEntry(vehicle, seat);
  if (!decor) return { ...door, free: true };
  const centre = vehicle.state.p,
    // The feet's rest height under the vehicle (EXIT_LIFT is the drop onto the support).
    rest = door.y - EXIT_LIFT,
    onFloor = rest <= MAP.metres(FLOOR_TOLERANCE),
    reach = Math.hypot(door.x - centre[0], door.z - centre[2]),
    heading = Math.atan2(door.z - centre[2], door.x - centre[0]),
    radius = MAP.metres(WALKER_RADIUS * BODY_MARGIN),
    height = MAP.metres(PERSON_HEIGHT);
  // The vehicle's own footprint (across and along the hull, from its attitude): not a place to stand.
  const q = vehicle.state.q,
    right = [1 - 2 * (q[1] * q[1] + q[2] * q[2]), 2 * (q[0] * q[2] - q[3] * q[1])],
    back = [2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] * q[0] + q[1] * q[1])],
    profile = VEHICLES[vehicle.type],
    halfSpan = MAP.metres(profile.span / 2) + radius,
    halfLength = MAP.metres(profile.length / 2) + radius;
  const insideHull = (x: number, z: number): boolean => {
    const dx = x - centre[0],
      dz = z - centre[2];
    return (
      Math.abs(dx * right[0] + dz * right[1]) < halfSpan &&
      Math.abs(dx * back[0] + dz * back[1]) < halfLength
    );
  };
  const standing = (x: number, z: number): ExitSpot | null => {
    const query: FootprintQuery = {
      x,
      y: door.y,
      z,
      angle: 0,
      rx: radius,
      rz: radius,
      height,
      rugged: true,
    };
    // On a prop: its flat surface under the footprint; on the floor: the floor itself.
    const surface = decor.surface(query) ?? (onFloor ? rest : null);
    if (surface == null || !decor.clear(query, surface)) return null;
    return { x, y: surface + EXIT_LIFT, z, free: true };
  };
  // The door itself first, so that a free door never moves.
  const atDoor = standing(door.x, door.z);
  if (atDoor) return { ...atDoor, x: door.x, z: door.z };
  for (const extra of EXTRA_DISTANCES) {
    const distance = reach + MAP.metres(extra);
    for (const degrees of ANGLES) {
      if (extra === 0 && degrees === 0) continue;
      const angle = heading + (degrees * Math.PI) / 180;
      const x = centre[0] + Math.cos(angle) * distance,
        z = centre[2] + Math.sin(angle) * distance;
      if (insideHull(x, z)) continue;
      const spot = standing(x, z);
      if (spot) return spot;
    }
  }
  return { ...door, free: false };
}
