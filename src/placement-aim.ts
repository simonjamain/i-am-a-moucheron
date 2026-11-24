import type { SolidProbe } from './solid-query.ts';
import type { XYZ } from './types.ts';

const AXES = ['x', 'y', 'z'] as const;
// Centre-of-camera ray against the solids (boxes and the props' real triangles, see
// solid-query.ts). A top face is a candidate point; a side or ceiling hit blocks the aim
// instead of placing through it. Distances are office metres.
export function placementAim(
  body: XYZ | null | undefined,
  origin: XYZ | null | undefined,
  direction: XYZ | null | undefined,
  ground: SolidProbe | null,
  reach: number,
): XYZ | null {
  if (!ground || !body || !origin || !direction || !Number.isFinite(reach)) return null;
  if (
    ![body.x, body.y, body.z, ...AXES.flatMap((k) => [origin[k], direction[k]])].every(
      Number.isFinite,
    )
  )
    return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-10) return null;
  const unit = [direction.x / length, direction.y / length, direction.z / length];
  const hit = ground.hit([origin.x, origin.y, origin.z], unit, 1e3);
  if (!hit || hit.distance <= 0 || hit.normal[1] < 0.7 || unit[1] >= 0) return null;
  const point = {
    x: origin.x + unit[0] * hit.distance,
    y: origin.y + unit[1] * hit.distance,
    z: origin.z + unit[2] * hit.distance,
  };
  return Math.hypot(point.x - body.x, point.z - body.z) <= reach + 1e-8 ? point : null;
}

// All vehicle model roots face local -Z. Turn that axis toward the builder.
export function placementFacing(
  builder: { x: number; z: number },
  position: { x: number; z: number },
): number {
  return Math.atan2(position.x - builder.x, position.z - builder.z);
}

// Aim beyond reach (too high, or a floor too far away): instead of vanishing, the
// preview lands at the farthest distance the builder can reach, along the same
// horizontal heading, on the first top surface found below the camera height.
export function reachClampedPlacement(
  body: XYZ | null | undefined,
  origin: XYZ | null | undefined,
  direction: XYZ | null | undefined,
  reach: number,
  cast: (origin: XYZ, direction: XYZ) => XYZ | null,
  // Builds the vectors handed to `cast` (the client needs real THREE.Vector3).
  vector: (x: number, y: number, z: number) => XYZ = (x, y, z) => ({ x, y, z }),
): XYZ | null {
  const direct = cast(origin as XYZ, direction as XYZ);
  if (direct || !body || !origin || !direction || !Number.isFinite(reach)) return direct;
  const length = Math.hypot(direction.x, direction.z);
  if (!(length > 1e-6)) return null;
  const heading = { x: direction.x / length, z: direction.z / length };
  for (const fraction of [1, 0.85, 0.7, 0.55, 0.4, 0.25]) {
    const distance = reach * fraction;
    const from = vector(body.x + heading.x * distance, origin.y, body.z + heading.z * distance);
    const point = cast(from, vector(0, -1, 0));
    if (point) return point;
  }
  return null;
}
