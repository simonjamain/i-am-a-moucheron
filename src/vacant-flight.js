import { stepFlight } from './flight.js';
import { resolveLanding } from './sortie.js';
import { MAP } from './scale.js';
import { OFFICE_LAYOUT } from './layout.js';
// This is the ordinary aircraft integrator with neutral controls, not an
// autopilot. A selected client owns it only while the cockpit is vacant.
export function stepVacantAircraft(T, state, profile, colliders, dt) {
  if (state.hp <= 0) return state;
  const position = new T.Vector3().fromArray(state.p),
    previous = position.clone(),
    velocity = new T.Vector3().fromArray(state.v),
    q = new T.Quaternion().fromArray(state.q),
    omega = new T.Vector3().fromArray(state.omega || [0, 0, 0]),
    gas = state.gas ?? (state.landed ? 0 : 0.65);
  stepFlight(
    T,
    {
      q,
      vel: velocity,
      omega,
      wind: new T.Vector3(),
      gas,
      wing: state.wing,
      engine: state.engine && state.fuelAvailable !== false,
      pitch: 0,
      roll: 0,
      yaw: 0,
      scale: MAP.ratio,
      profile,
    },
    dt,
  );
  position.addScaledVector(velocity, dt);
  const landing = resolveLanding(
    T,
    { position, vel: velocity, q, omega, gear: profile.gear },
    previous,
    colliders,
    dt,
  );
  if (landing.landed) {
    velocity.x *= Math.exp(-dt * 0.35);
    velocity.z *= Math.exp(-dt * 0.35);
    if (gas < 0.12)
      velocity.multiplyScalar(
        Math.max(0, 1 - (MAP.metres(6) * dt) / Math.max(1e-9, velocity.length())),
      );
  }
  if (
    landing.hard ||
    position.y < 0 ||
    position.y > OFFICE_LAYOUT.bounds.ceiling ||
    Math.abs(position.x) > OFFICE_LAYOUT.bounds.x ||
    Math.abs(position.z) > OFFICE_LAYOUT.bounds.z ||
    colliders.some((box) => box.containsPoint(position))
  )
    state.hp = 0;
  Object.assign(state, {
    p: position.toArray(),
    q: q.toArray(),
    v: velocity.toArray(),
    omega: omega.toArray(),
    landed: landing.landed,
    gas,
  });
  return state;
}
