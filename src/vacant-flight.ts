import { stepFlight, ROLLING_FRICTION } from './flight.ts';
import { resolveLanding, withoutDecor } from './sortie.ts';
import { MAP, ACTOR_UNIT } from './scale.ts';
import { sweptHitsDecor } from './office-collision.ts';
import { OFFICE_LAYOUT } from './layout.ts';
import type * as THREE from 'three';
import type { FlightProfile } from './flight.ts';
import type { DecorQuery } from './sortie.ts';
import type { DecorCollision } from './office-collision.ts';
import type { Three } from './types.ts';
/** Networked aircraft state stepped in place while its cockpit is vacant. */
export interface VacantAircraftState {
  hp: number;
  p: number[];
  v: number[];
  q: number[];
  omega?: number[] | null;
  gas?: number;
  landed?: boolean;
  wing?: unknown;
  engine?: boolean | number;
  fuelAvailable?: boolean;
}
export type VacantAircraftProfile = FlightProfile & { gear?: number };
/** The decor world as used here: landing support plus swept contact. */
export type VacantDecor = DecorQuery & Pick<DecorCollision, 'touches' | 'raycast'>;
// This is the ordinary aircraft integrator with neutral controls, not an
// autopilot. A selected client owns it only while the cockpit is vacant.
// `decor`: the props' triangle colliders (office-collision.ts), when built.
export function stepVacantAircraft(
  T: Three,
  state: VacantAircraftState,
  profile: VacantAircraftProfile,
  allColliders: readonly THREE.Box3[],
  dt: number,
  decor: VacantDecor | null = null,
): VacantAircraftState {
  const colliders = withoutDecor(allColliders, decor);
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
    decor,
  );
  if (landing.landed) {
    velocity.x *= Math.exp(-dt * ROLLING_FRICTION);
    velocity.z *= Math.exp(-dt * ROLLING_FRICTION);
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
    colliders.some((box) => box.containsPoint(position)) ||
    (decor && sweptHitsDecor(decor, previous.toArray(), position.toArray(), 0.1 * ACTOR_UNIT))
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
