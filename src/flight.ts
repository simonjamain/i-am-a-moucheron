import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
// Miniature fighter tuning inspired by a Merlin Spitfire's turn-fighting role.
// Units belong to the desk arena; these are not measured Spitfire coefficients.
/** Aerodynamic overrides from a VEHICLES entry; omitted fields use the fighter defaults. */
export interface FlightProfile {
  authoritySpeed?: number;
  /** Plane physics: stall speed as a fraction of the top speed (0.32 by default; lower lifts at a lower speed). */
  stallFraction?: number;
  turn?: number;
  stallAngle?: number;
  liftBase?: number;
  drag?: number;
  thrust?: number;
  maxSpeed?: number;
}
/** Mutable aircraft state stepped in place (q, vel, omega are updated). */
export interface FlightState {
  q: THREE.Quaternion;
  vel: THREE.Vector3;
  omega: THREE.Vector3;
  wind: THREE.Vector3;
  gas: number;
  /** Truthy when the engine can produce thrust (number kept for older callers). */
  engine?: boolean | number;
  pitch: number;
  roll: number;
  yaw?: number;
  /** Miniature ratio: linear quantities are divided by it before integrating. */
  scale?: number;
  profile?: FlightProfile | null;
  /** Ignored by the integrator; callers pass it along with the rest of their state. */
  wing?: unknown;
}
export interface FlightStep {
  forward: THREE.Vector3;
  speed: number;
  bank: number;
  aoa: number;
  stall: number;
  lift: number;
  authority: number;
}

function unscaledFlight(
  T: Three,
  { q, vel, omega, wind, gas, engine = 1, pitch, roll, yaw = 0, profile = null }: FlightState,
  dt: number,
): FlightStep {
  const clamp = T.MathUtils.clamp;
  let forward = new T.Vector3(0, 0, -1).applyQuaternion(q),
    up = new T.Vector3(0, 1, 0).applyQuaternion(q),
    right = new T.Vector3(1, 0, 0).applyQuaternion(q);
  const air = vel.clone().sub(wind),
    speed = air.length();
  const authority =
    clamp(speed / (profile?.authoritySpeed ?? 13), 0.12, 1) *
    clamp(38 / Math.max(speed, 38), 0.55, 1);
  const bank = Math.atan2(-right.y, up.y);
  // Three independent control axes; no auto-level, bank target or yaw instructor.
  const turn = profile?.turn ?? 1;
  const rollRate = roll * 2.25 * turn;
  const response = 1 - Math.exp(-9 * dt);
  omega.x += (pitch * 1.12 * authority * turn - omega.x) * response;
  omega.z += (rollRate * authority - omega.z) * response;
  omega.y += (-yaw * 0.8 * authority * turn - omega.y) * response;
  q.multiply(
    new T.Quaternion().setFromEuler(new T.Euler(omega.x * dt, omega.y * dt, omega.z * dt, 'XYZ')),
  ).normalize();
  forward.set(0, 0, -1).applyQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q);
  right.set(1, 0, 0).applyQuaternion(q);
  const fSpeed = Math.max(0, air.dot(forward));
  const aoa = Math.atan2(-air.dot(up), Math.max(1, fSpeed));
  const stall = 1 - 0.82 * clamp((Math.abs(aoa) - (profile?.stallAngle ?? 0.3)) / 0.32, 0, 1);
  const lift =
    clamp(
      ((profile?.liftBase ?? 0.04) + aoa * (profile?.liftBase ? 0.12 : 0.48)) * fSpeed * fSpeed,
      -24,
      40,
    ) * stall;
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

// Ground rolling resistance (per second) and the speed at which a pull-back
// lifts the nose. Every aircraft must out-accelerate the first so it can reach
// the second on a flat surface; scripts/test-takeoff.mjs checks the whole fleet.
export const ROLLING_FRICTION = 0.1;
export const LIFTOFF_SPEED = 18;

// Dynamics use reference metres/seconds. Scaling every linear quantity here
// preserves the same manoeuvre and timing on maps of different miniature ratios.
export function stepFlight(T: Three, state: FlightState, dt: number): FlightStep {
  const scale = state.scale ?? 1;
  const vel = state.vel.clone().multiplyScalar(1 / scale),
    wind = state.wind.clone().multiplyScalar(1 / scale);
  const result = unscaledFlight(T, { ...state, vel, wind }, dt);
  state.vel.copy(vel).multiplyScalar(scale);
  return result;
}
