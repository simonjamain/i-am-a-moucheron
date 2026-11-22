import type * as THREE from 'three';
import type { Three, XYZ } from './types.ts';
export interface ShoulderView {
  target: THREE.Vector3;
  offset: THREE.Vector3;
  eye: THREE.Vector3;
}
export interface ShotAim {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  range: number;
}

export function shoulderView(
  T: Three,
  position: XYZ,
  yaw: number,
  pitch: number,
  distance: number,
  scale: number,
): ShoulderView {
  const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const target = new T.Vector3(position.x, position.y + 1.55 * scale, position.z).addScaledVector(
    right,
    0.7 * scale,
  );
  const offset = new T.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).multiplyScalar(distance * scale);
  return { target, offset, eye: target.clone().add(offset) };
}
/** Third-person pivot height (scale units; the person is 1.8 tall) and floor margin. */
export const SHOULDER_HEIGHT = 1.85;
export const FLOOR_CLEARANCE = 0.3;
export const GROUND_VIEW_DISTANCE = { initial: 3.2, min: 3.2, max: 9 } as const;
export const GROUND_VIEW_PITCH = 0.14;
export interface ShoulderCamera extends ShoulderView {
  /** Unit vector the camera looks along (from the full, unclamped pitch). */
  forward: THREE.Vector3;
  /** True when the player looks above what the orbit can reach (camera at floor level). */
  tilted: boolean;
}
/**
 * Third-person camera that can look at the sky. The mouse pitch drives the view
 * direction; the camera orbits the shoulder pivot only down to the floor margin.
 * Below that the camera stays low and simply tilts up, instead of sinking into
 * the floor and being pushed against the character.
 */
export function shoulderCamera(
  T: Three,
  position: XYZ,
  yaw: number,
  pitch: number,
  distance: number,
  scale: number,
): ShoulderCamera {
  const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const target = new T.Vector3(
    position.x,
    position.y + SHOULDER_HEIGHT * scale,
    position.z,
  ).addScaledVector(right, 0.7 * scale);
  const lowest = Math.asin(
    Math.max(-1, Math.min(1, (FLOOR_CLEARANCE - SHOULDER_HEIGHT) / Math.max(distance, 1e-6))),
  );
  const orbit = Math.max(pitch, lowest);
  const direction = (angle: number) =>
    new T.Vector3(
      Math.sin(yaw) * Math.cos(angle),
      Math.sin(angle),
      Math.cos(yaw) * Math.cos(angle),
    );
  const offset = direction(orbit).multiplyScalar(distance * scale);
  return {
    target,
    offset,
    eye: target.clone().add(offset),
    forward: direction(pitch).negate(),
    tilted: pitch < lowest,
  };
}
export function aimPistol(
  T: Three,
  person: THREE.Object3D | null | undefined,
  direction: THREE.Vector3,
): void {
  const arm = person?.userData.arms?.[1];
  if (!arm) return;
  person.updateWorldMatrix(true, true);
  const parent = arm.pivot.parent!.getWorldQuaternion(new T.Quaternion()).invert();
  const local = direction.clone().applyQuaternion(parent).normalize();
  arm.pivot.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), local);
  arm.elbow.rotation.set(0, 0, 0);
  person.updateWorldMatrix(true, true);
}
export function muzzleAim(
  T: Three,
  camera: THREE.Camera,
  muzzle: THREE.Object3D,
  target: THREE.Vector3,
  range: number,
): ShotAim | null {
  const origin = muzzle.getWorldPosition(new T.Vector3()),
    direction = target.clone().sub(origin);
  const forward = camera.getWorldDirection(new T.Vector3());
  if (direction.lengthSq() < 1e-12 || direction.dot(forward) <= 0) return null;
  return { origin, direction: direction.normalize(), range };
}
