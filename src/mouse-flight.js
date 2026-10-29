// Independent implementation of direction-based mouse aim and an aircraft instructor.
// Camera/aim separation inspired by https://github.com/brihernandez/MouseFlight .
// Aircraft forces and angular response remain in flight.js.
export function rotateMouseAim(T, direction, cameraQ, dx, dy, sensitivity = 0.0026) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const right = new T.Vector3(1, 0, 0).applyQuaternion(cameraQ);
  const up = new T.Vector3(0, 1, 0).applyQuaternion(cameraQ);
  direction
    .applyAxisAngle(right, -T.MathUtils.clamp(dy, -200, 200) * sensitivity)
    .applyAxisAngle(up, -T.MathUtils.clamp(dx, -200, 200) * sensitivity)
    .normalize();
}
export function mouseFlightControls(T, { q, omega, direction }) {
  const local = direction.clone().normalize().applyQuaternion(q.clone().invert());
  const yawError = Math.atan2(local.x, -local.z);
  const pitchError = Math.atan2(local.y, Math.max(0.05, -local.z));
  const right = new T.Vector3(1, 0, 0).applyQuaternion(q);
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
  const bank = Math.atan2(-right.y, up.y);
  // Bank into horizontal turns; progressively prefer wings-level as the target aligns.
  // Do not change the quaternion here: these are ordinary control-surface commands.
  const desiredBank = T.MathUtils.clamp(yawError * 1.35, -1.25, 1.25);
  return {
    pitch: T.MathUtils.clamp(pitchError * 2.8 - omega.x * 0.45, -1, 1),
    roll: T.MathUtils.clamp((bank - desiredBank) * 1.8 - omega.z * 0.45, -1, 1),
    yaw: T.MathUtils.clamp(yawError * 0.9 + omega.y * 0.35, -1, 1),
  };
}
export function mouseCameraRotation(T, direction, previous, dt) {
  // At the poles retain the rig's up direction instead of flipping the horizon.
  const up =
    Math.abs(direction.y) > 0.92
      ? new T.Vector3(0, 1, 0).applyQuaternion(previous)
      : new T.Vector3(0, 1, 0);
  const matrix = new T.Matrix4().lookAt(new T.Vector3(), direction, up);
  const target = new T.Quaternion().setFromRotationMatrix(matrix);
  return previous.slerp(target, 1 - Math.exp(-6 * Math.max(0, dt))).normalize();
}

// Keep pointer decisions independent from DOM state and pointer-lock side effects.
export function flightClickAction(event, { active, locked }) {
  if (!active || event.button !== 0 || event.pointerType !== 'mouse') return null;
  return locked ? 'fire' : 'capture';
}
