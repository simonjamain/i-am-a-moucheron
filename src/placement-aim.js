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
  for (const box of colliders) {
    let near = -Infinity,
      far = Infinity,
      face;
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(direction[axis]) < 1e-10) {
        if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) {
          far = -Infinity;
          break;
        }
        continue;
      }
      const a = (box.min[axis] - origin[axis]) / direction[axis];
      const b = (box.max[axis] - origin[axis]) / direction[axis];
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
