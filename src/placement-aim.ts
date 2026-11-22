import { colliderPoint, colliderBounds } from './oriented-collider.ts';
import type { Collider } from './oriented-collider.ts';
import type { XYZ } from './types.ts';

const AXES = ['x', 'y', 'z'] as const;
// Centre-of-camera ray against solid office boxes. A side/ceiling hit blocks
// placement instead of placing through it. Distances are office metres.
export function placementAim(
  body: XYZ | null | undefined,
  origin: XYZ | null | undefined,
  direction: XYZ | null | undefined,
  colliders: Iterable<Collider>,
  reach: number,
): XYZ | null {
  if (!body || !origin || !direction || !Number.isFinite(reach)) return null;
  if (
    ![body.x, body.y, body.z, ...AXES.flatMap((k) => [origin[k], direction[k]])].every(
      Number.isFinite,
    )
  )
    return null;
  let closest = Infinity,
    point: XYZ | null = null;
  for (const collider of colliders) {
    const box = colliderBounds(collider);
    const local = colliderPoint(collider, [origin.x, origin.y, origin.z]);
    const f = collider.oriented;
    const rayOrigin: XYZ = f ? { x: local[0], y: local[1], z: local[2] } : origin;
    const rayDirection: XYZ = f
      ? {
          x: f.c * direction.x - f.s * direction.z,
          y: direction.y,
          z: f.s * direction.x + f.c * direction.z,
        }
      : direction;
    let near = -Infinity,
      far = Infinity,
      face: boolean | undefined;
    for (const axis of AXES) {
      if (Math.abs(rayDirection[axis]) < 1e-10) {
        if (rayOrigin[axis] < box.min[axis] || rayOrigin[axis] > box.max[axis]) {
          far = -Infinity;
          break;
        }
        continue;
      }
      const a = (box.min[axis] - rayOrigin[axis]) / rayDirection[axis];
      const b = (box.max[axis] - rayOrigin[axis]) / rayDirection[axis];
      if (Math.min(a, b) > near) {
        near = Math.min(a, b);
        face = axis === 'y' && direction.y < 0;
      }
      far = Math.min(far, Math.max(a, b));
    }
    if (near < 0 || near > far || near >= closest) continue;
    closest = near;
    point = face
      ? {
          x: origin.x + direction.x * near,
          y: origin.y + direction.y * near,
          z: origin.z + direction.z * near,
        }
      : null;
  }
  return point && Math.hypot(point.x - body.x, point.z - body.z) <= reach + 1e-8 ? point : null;
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
