// Return the world-space tip of the next visible pilot barrel.
// Child nodes move with the gun mesh, hull transform and miniature scale.
export function nextPilotMuzzle(T, model) {
  const muzzles = model?.userData?.pilotMuzzles;
  if (!muzzles?.length) return null;
  const index = model.userData.nextPilotMuzzleIndex ?? 0;
  model.userData.nextPilotMuzzleIndex = (index + 1) % muzzles.length;
  model.updateWorldMatrix(true, true);
  return muzzles[index].getWorldPosition(new T.Vector3());
}

// Find the actual barrel node for an emitted shot, before applying dispersion.
export function nearestWeaponMuzzle(T, model, position) {
  if (!model) return null;
  const candidates = [...(model.userData.pilotMuzzles || []), ...(model.userData.muzzles || [])];
  for (const turret of model.userData.turrets || []) {
    const u = turret.userData;
    candidates.push(...(u.muzzles || [u.muzzle, u.coaxMuzzle]).filter(Boolean));
  }
  model.updateWorldMatrix(true, true);
  let nearest = null,
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
