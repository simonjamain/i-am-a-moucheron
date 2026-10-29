// Miniature fighter tuning inspired by a Merlin Spitfire's turn-fighting role.
// Units belong to the desk arena; these are not measured Spitfire coefficients.
function unscaledFlight(
  T,
  { q, vel, omega, wind, gas, wing, engine, pitch, roll, yaw = 0, profile = null },
  dt,
) {
  const clamp = T.MathUtils.clamp;
  let forward = new T.Vector3(0, 0, -1).applyQuaternion(q),
    up = new T.Vector3(0, 1, 0).applyQuaternion(q),
    right = new T.Vector3(1, 0, 0).applyQuaternion(q);
  const air = vel.clone().sub(wind),
    speed = air.length();
  const authority =
    clamp(speed / 13, 0.12, 1) * clamp(38 / Math.max(speed, 38), 0.55, 1) * (wing ? 1 : 0.55);
  const bank = Math.atan2(-right.y, up.y);
  // Three independent control axes; no auto-level, bank target or yaw instructor.
  const turn = profile?.turn ?? 1;
  const rollRate = roll * 2.25 * turn;
  const response = 1 - Math.exp(-9 * dt);
  omega.x += (pitch * 1.12 * authority * turn - omega.x) * response;
  omega.z += (rollRate * authority - omega.z) * response;
  omega.y += (-yaw * 0.8 * authority * turn - omega.y) * response;
  if (!wing) omega.z += dt * 1.8;
  q.multiply(
    new T.Quaternion().setFromEuler(new T.Euler(omega.x * dt, omega.y * dt, omega.z * dt, 'XYZ')),
  ).normalize();
  forward.set(0, 0, -1).applyQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q);
  right.set(1, 0, 0).applyQuaternion(q);
  const fSpeed = Math.max(0, air.dot(forward));
  const aoa = Math.atan2(-air.dot(up), Math.max(1, fSpeed));
  const stall = 1 - 0.82 * clamp((Math.abs(aoa) - 0.3) / 0.32, 0, 1);
  const lift =
    clamp(
      ((profile?.liftBase ?? 0.04) + aoa * (profile?.liftBase ? 0.12 : 0.48)) * fSpeed * fSpeed,
      -24,
      40,
    ) *
    stall *
    (wing ? 1 : 0.48);
  const induced = (0.025 * lift * lift) / Math.max(36, speed * speed);
  const drag = (profile?.drag ?? 0.016) * speed + 0.055 + induced + (1 - stall) * 0.4;
  const force = forward
    .clone()
    .multiplyScalar(engine ? gas * (profile?.thrust ?? 12) : 0)
    .addScaledVector(up, lift)
    .add(new T.Vector3(0, -8, 0));
  force
    .addScaledVector(air, -drag)
    .addScaledVector(right, -air.dot(right) * 3.2)
    .addScaledVector(wind, 0.25);
  vel.addScaledVector(force, dt);
  if (vel.length() > (profile?.maxSpeed ?? 70)) vel.setLength(profile?.maxSpeed ?? 70);
  return { forward, speed, bank, aoa, stall, lift, authority };
}

// Dynamics use reference metres/seconds. Scaling every linear quantity here
// preserves the same manoeuvre and timing on maps of different miniature ratios.
export function stepFlight(T, state, dt) {
  const scale = state.scale ?? 1;
  const vel = state.vel.clone().multiplyScalar(1 / scale),
    wind = state.wind.clone().multiplyScalar(1 / scale);
  const result = unscaledFlight(T, { ...state, vel, wind }, dt);
  state.vel.copy(vel).multiplyScalar(scale);
  return result;
}
