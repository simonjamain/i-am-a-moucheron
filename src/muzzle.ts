import type * as THREE from 'three';
import type { Three } from './types.ts';
// Return the world-space tip of the next visible pilot barrel.
// Child nodes move with the gun mesh, hull transform and miniature scale.
export function nextPilotMuzzle(
  T: Three,
  model: THREE.Object3D | null | undefined,
): THREE.Vector3 | null {
  const muzzles: THREE.Object3D[] | undefined = model?.userData?.pilotMuzzles;
  if (!model || !muzzles?.length) return null;
  const index: number = model.userData.nextPilotMuzzleIndex ?? 0;
  model.userData.nextPilotMuzzleIndex = (index + 1) % muzzles.length;
  model.updateWorldMatrix(true, true);
  return muzzles[index].getWorldPosition(new T.Vector3());
}

// Find the actual barrel node for an emitted shot, before applying dispersion.
export function nearestWeaponMuzzle(
  T: Three,
  model: THREE.Object3D | null | undefined,
  position: THREE.Vector3,
): THREE.Object3D | null {
  if (!model) return null;
  const candidates: THREE.Object3D[] = [
    ...(model.userData.pilotMuzzles || []),
    ...(model.userData.muzzles || []),
  ];
  for (const turret of (model.userData.turrets || []) as THREE.Object3D[]) {
    const u = turret.userData;
    candidates.push(...(u.muzzles || [u.muzzle, u.coaxMuzzle]).filter(Boolean));
  }
  model.updateWorldMatrix(true, true);
  let nearest: THREE.Object3D | null = null,
    distance = Infinity;
  for (const node of new Set(candidates)) {
    const d = node.getWorldPosition(new T.Vector3()).distanceToSquared(position);
    if (d < distance) {
      nearest = node;
      distance = d;
    }
  }
  return nearest;
}
