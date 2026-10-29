export function shoulderView(T, position, yaw, pitch, distance, scale) {
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
export function aimPistol(T, person, direction) {
  const arm = person?.userData.arms?.[1];
  if (!arm) return;
  person.updateWorldMatrix(true, true);
  const parent = arm.pivot.parent.getWorldQuaternion(new T.Quaternion()).invert();
  const local = direction.clone().applyQuaternion(parent).normalize();
  arm.pivot.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), local);
  arm.elbow.rotation.set(0, 0, 0);
  person.updateWorldMatrix(true, true);
}
export function muzzleAim(T, camera, muzzle, target, range) {
  const origin = muzzle.getWorldPosition(new T.Vector3()),
    direction = target.clone().sub(origin);
  const forward = camera.getWorldDirection(new T.Vector3());
  if (direction.lengthSq() < 1e-12 || direction.dot(forward) <= 0) return null;
  return { origin, direction: direction.normalize(), range };
}
