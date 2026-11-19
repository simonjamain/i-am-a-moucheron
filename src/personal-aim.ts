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
