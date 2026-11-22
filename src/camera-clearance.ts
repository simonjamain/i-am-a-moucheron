import type { XYZ } from './types.ts';

// A chase camera must not sit behind furniture, a box or a wall: the player would no longer
// see their own vehicle. The ray goes from the followed point (the vehicle, the shoulder) to
// the wanted eye; the eye stops just before the first obstacle on that segment. Only what lies
// between the two counts, so a vehicle sitting inside a box keeps a camera inside that box.

/** Distance to the first obstacle along `direction` within `far`; Infinity when the way is free. */
export type CastRay = (origin: XYZ, direction: XYZ, far: number) => number;

/** Gap kept before the obstacle, as a fraction of the wanted distance. */
export const CLEARANCE_MARGIN = 0.03;
/** The camera never comes closer than this fraction of the wanted distance. */
export const CLEARANCE_MIN = 0.03;

/** The eye pulled in along the segment from `target` to `eye`, or `eye` itself when the way is free. */
export function clearEye(target: XYZ, eye: XYZ, cast: CastRay): XYZ {
  const dx = eye.x - target.x,
    dy = eye.y - target.y,
    dz = eye.z - target.z,
    length = Math.hypot(dx, dy, dz);
  if (!(length > 1e-12)) return { x: eye.x, y: eye.y, z: eye.z };
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  const hit = cast(target, direction, length);
  if (!(hit < length)) return { x: eye.x, y: eye.y, z: eye.z };
  const distance = Math.min(
    length,
    Math.max(CLEARANCE_MIN * length, hit - CLEARANCE_MARGIN * length),
  );
  return {
    x: target.x + direction.x * distance,
    y: target.y + direction.y * distance,
    z: target.z + direction.z * distance,
  };
}
