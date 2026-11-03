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
