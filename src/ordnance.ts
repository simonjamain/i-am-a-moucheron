export { segmentBox } from './swept-geometry.ts';
import { heliWeaponOrigin } from './helicopter.ts';
import { mobileBarrelOrigin, clampProximity } from './mobile-flak.ts';
import { tankBarrelOrigin } from './tank-view.ts';
import { MAP } from './scale.ts';
import { HEAVY } from './armament.ts';
import { isBomber } from './fleet.ts';
import type { HeavyKind } from './armament.ts';
import type { VehicleType } from './fleet.ts';

type Vec = readonly number[];
/** A heavy projectile in flight (rocket, missile, shell, bomb), simulated by heavy-sim.js. */
export interface OrdnanceState {
  /** Rockets and missiles fly straight; anything else (or nothing) falls and slows. */
  weapon?: string;
  p: number[];
  v: number[];
  age: number;
}
/** The firing vehicle as createOrdnance reads it (server vehicle record). */
export interface OrdnanceVehicle {
  id: string;
  type: VehicleType;
  state: { p: number[]; q: number[]; v: number[]; trailerAngle?: number };
  supplies: { sequence: number };
  rocketSide?: number;
  proximity?: number;
  seats?: { get?: (seat: string) => unknown };
  missileOccupation?: unknown;
}
export interface OrdnanceRequest {
  shot: unknown;
  weapon: HeavyKind;
  vehicle: OrdnanceVehicle;
  shooter: unknown;
  direction: number[];
  now: number;
  wave: unknown;
}
export const add = (a: Vec, b: Vec): number[] => a.map((v, i) => v + b[i]);
const sub = (a: Vec, b: Vec): number[] => a.map((v, i) => v - b[i]);
const dot = (a: Vec, b: Vec): number => a.reduce((n, v, i) => n + v * b[i], 0);
export function segmentSphere(a: Vec, b: Vec, centre: Vec, radius: number): number | null {
  for (let i = 0; i < 3; i++)
    if (centre[i] + radius < Math.min(a[i], b[i]) || centre[i] - radius > Math.max(a[i], b[i]))
      return null;
  const d = sub(b, a),
    m = sub(a, centre),
    n = dot(d, d);
  if (n < 1e-16) return dot(m, m) <= radius * radius ? 0 : null;
  const t = Math.max(0, Math.min(1, -dot(m, d) / n)),
    p = add(
      a,
      d.map((v) => v * t),
    );
  return Math.hypot(...sub(p, centre)) <= radius ? t : null;
}
export function integrateOrdnance(projectile: OrdnanceState, dt: number): number[] {
  const before = [...projectile.p];
  if (projectile.weapon === 'rocket' || projectile.weapon === 'missile') {
    projectile.p = add(
      projectile.p,
      projectile.v.map((v) => v * dt),
    );
    projectile.age += dt;
    return before;
  }
  projectile.v[1] -= MAP.metres(9.81) * dt;
  const drag = 1 / (1 + ((Math.hypot(...projectile.v) * 0.00015) / MAP.ratio) * dt);
  projectile.v = projectile.v.map((v) => v * drag);
  projectile.p = add(
    projectile.p,
    projectile.v.map((v) => v * dt),
  );
  projectile.age += dt;
  return before;
}
export function createOrdnance({
  shot,
  weapon,
  vehicle,
  shooter,
  direction,
  now,
  wave,
}: OrdnanceRequest) {
  const profile = HEAVY[weapon],
    q = vehicle.state.q;
  const forward = [
    -2 * (q[0] * q[2] + q[3] * q[1]),
    -2 * (q[1] * q[2] - q[3] * q[0]),
    -(1 - 2 * (q[0] * q[0] + q[1] * q[1])),
  ];
  const n = Math.hypot(...direction) || 1,
    dir = weapon === 'rocket' ? forward : direction.map((v) => v / n);
  const p =
    weapon === 'bomb'
      ? vehicle.state.p.map((v, i) => v + (i === 1 ? -MAP.metres(1.5) : 0))
      : vehicle.type === 'helicopter'
        ? heliWeaponOrigin(vehicle, weapon, vehicle.rocketSide || 1)
        : vehicle.type === 'flaktruck'
          ? mobileBarrelOrigin(vehicle, dir)
          : tankBarrelOrigin(vehicle, dir);
  const v =
    weapon === 'bomb'
      ? [...vehicle.state.v]
      : dir.map((v, i) => v * profile.speed + vehicle.state.v[i]);
  return {
    shot,
    weapon,
    vehicle: vehicle.id,
    sequence: vehicle.supplies.sequence,
    proximity: weapon === 'proximity' ? clampProximity(vehicle.proximity ?? 5) : undefined,
    radiusFactor: weapon === 'bomb' && isBomber(vehicle.type) ? 2 : 1,
    shooter,
    occupation: vehicle.seats?.get?.('copilot') === shooter ? vehicle.missileOccupation : undefined,
    p,
    v,
    age: 0,
    at: now,
    updated: now,
    wave,
    bonus: weapon === 'bomb' && forward[1] < -0.65 ? 1.35 : 1,
  };
}
