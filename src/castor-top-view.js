// Castor top-down view (key V): the camera hangs straight above the truck,
// the truck's front pointing up on screen, so the driver sees the whole
// building reach around it. The mouse moves a cursor on the floor instead of
// orbiting the camera: placement previews and the light machine gun both aim
// at that floor point.
export const TOP_VIEW_HEIGHT = 0.4; // metres above the truck: covers the 24 cm building reach
export const TOP_VIEW_CURSOR_LIMIT = 0.95; // normalised screen coordinates
const DEFAULT_CURSOR = Object.freeze({ x: 0, y: 0.3 });

export function resetTopCursor(cursor) {
  cursor.x = DEFAULT_CURSOR.x;
  cursor.y = DEFAULT_CURSOR.y;
  return cursor;
}

// Pointer-lock deltas (pixels) move the cursor in normalised screen space.
export function moveTopCursor(cursor, dx, dy, { width, height, sensitivity = 1 }) {
  const clamp = (v) => Math.max(-TOP_VIEW_CURSOR_LIMIT, Math.min(TOP_VIEW_CURSOR_LIMIT, v));
  cursor.x = clamp(cursor.x + ((2 * dx) / Math.max(1, width)) * sensitivity);
  cursor.y = clamp(cursor.y - ((2 * dy) / Math.max(1, height)) * sensitivity);
  return cursor;
}

// Eye straight above the truck; screen "up" is the truck's horizontal heading.
export function topViewPose(T, position, quaternion) {
  const forward = new T.Vector3(0, 0, -1).applyQuaternion(quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-12) forward.set(0, 0, -1);
  forward.normalize();
  return {
    eye: position.clone().add(new T.Vector3(0, TOP_VIEW_HEIGHT, 0)),
    up: forward,
    target: position.clone(),
  };
}

// Ray from the camera through the cursor, for placement and for the floor point.
export function topViewRay(T, camera, cursor) {
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(cursor.x, cursor.y), camera);
  return { origin: ray.ray.origin.clone(), direction: ray.ray.direction.clone() };
}

// Intersection of that ray with the horizontal plane y = groundY.
export function topViewGroundPoint(T, camera, cursor, groundY) {
  const { origin, direction } = topViewRay(T, camera, cursor);
  if (direction.y > -1e-6) return null;
  const t = (groundY - origin.y) / direction.y;
  return t > 0 ? origin.addScaledVector(direction, t) : null;
}
