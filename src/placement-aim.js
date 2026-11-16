import { colliderPoint, colliderBounds } from './oriented-collider.js';
// Centre-of-camera ray against solid office boxes. A side/ceiling hit blocks
// placement instead of placing through it. Distances are office metres.
export function placementAim(body, origin, direction, colliders, reach) {
  if (!body || !origin || !direction || !Number.isFinite(reach)) return null;
  if (
    ![body.x, body.y, body.z, ...['x', 'y', 'z'].flatMap((k) => [origin[k], direction[k]])].every(
      Number.isFinite,
    )
  )
    return null;
  let closest = Infinity,
    point = null;
  for (const collider of colliders) {
    const box = colliderBounds(collider);
    const local = colliderPoint(collider, [origin.x, origin.y, origin.z]);
    const f = collider.oriented;
    const rayOrigin = f ? { x: local[0], y: local[1], z: local[2] } : origin;
    const rayDirection = f
      ? {
          x: f.c * direction.x - f.s * direction.z,
          y: direction.y,
          z: f.s * direction.x + f.c * direction.z,
        }
      : direction;
    let near = -Infinity,
      far = Infinity,
      face;
    for (const axis of ['x', 'y', 'z']) {
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
export function placementFacing(builder, position) {
  return Math.atan2(position.x - builder.x, position.z - builder.z);
}
