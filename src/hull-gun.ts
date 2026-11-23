import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

// The medium tank's driver machine gun sits in the hull: it follows the driver's
// aim inside a cone of +/-15 degrees around the hull's forward axis (-Z).
export const HULL_GUN_CONE = (15 * Math.PI) / 180;

// `direction` (world) limited to the cone of half-angle `limit` around `axis`.
export function clampToCone(
  T: Three,
  direction: THREE.Vector3,
  axis: THREE.Vector3,
  limit: number = HULL_GUN_CONE,
): THREE.Vector3 {
  const forward = axis.clone().normalize();
  const wanted = direction.clone().normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, wanted.dot(forward))));
  if (!(angle > limit)) return wanted;
  // Sideways part of the wanted direction, rebuilt at exactly `limit` from the axis.
  const side = wanted.addScaledVector(forward, -wanted.dot(forward));
  if (side.lengthSq() < 1e-12) return forward;
  return forward.multiplyScalar(Math.cos(limit)).addScaledVector(side.normalize(), Math.sin(limit));
}

// World direction of the hull gun for a hull orientation and the driver's aim.
export function hullGunDirection(
  T: Three,
  hull: THREE.Quaternion,
  aim: THREE.Vector3,
): THREE.Vector3 {
  return clampToCone(T, aim, new T.Vector3(0, 0, -1).applyQuaternion(hull));
}
