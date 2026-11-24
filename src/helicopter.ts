import { colliderContainsXZ } from './oriented-collider.ts';
import { segmentBox } from './swept-geometry.ts';
import { MAP, ACTOR_UNIT } from './scale.ts';
import { PROJECTILES } from './projectiles.ts';
import { OFFICE_LAYOUT } from './layout.ts';
import { outOfFlight } from './sky-passage.ts';
import { VEHICLE_ANCHORS } from './vehicle-anchors.ts';
import type { Collider } from './oriented-collider.ts';
import type { Three, Vec3 } from './types.ts';

/** Gunner aim: yaw (any angle, wrapped) and pitch (clamped to the turret range). */
export interface HeliAim {
  yaw: number;
  pitch: number;
}
/** Simulated rotorcraft state, mutated in place by `stepHelicopter`. */
export interface HelicopterState {
  p: number[];
  v: number[];
  q: number[];
  hp: number;
  engine?: boolean;
  fuelAvailable?: boolean;
  rotorPower?: number;
  collective?: number;
  landed?: boolean;
  gas?: number;
  omega?: number[];
}
/** Pilot input: either a camera `direction` or explicit pitch/roll/yaw axes in [-1, 1]. */
export interface HelicopterControls {
  occupied?: boolean;
  collective?: number;
  direction?: readonly number[] | null;
  yaw?: number;
  pitch?: number;
  roll?: number;
}
export interface HelicopterProfile {
  /** Top speed, in model metres per second. */
  maxSpeed: number;
  /** Height of the landing gear under the origin. */
  gear: number;
}

export const HELI = Object.freeze({
  gunInterval: 1 / 15,
  gunDamage: PROJECTILES.mg.damage,
  maxTilt: Math.PI / 4,
  turretSpeed: Math.PI,
  descentSpeed: 30,
  minPitch: -1.45,
  maxPitch: 0,
  missileTurn: 1.2,
  // Keyboard turn rate (A/E) when no mouse direction steers (Castor volant vertical view).
  yawRate: 1.4,
});
export function clampHeliAim<A extends HeliAim>(aim: A): A {
  aim.yaw = Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw));
  aim.pitch = Math.max(HELI.minPitch, Math.min(HELI.maxPitch, aim.pitch));
  return aim;
}
// Pending relative input is consumed once. Excess mouse motion is discarded,
// never carried as a target to chase after the pointer stops.
export function stepHeliAim(actual: HeliAim, pending: HeliAim, dt: number): HeliAim {
  const yaw = pending.yaw - actual.yaw;
  const pitch = Math.max(HELI.minPitch, Math.min(HELI.maxPitch, pending.pitch)) - actual.pitch;
  const distance = Math.hypot(yaw, pitch);
  if (distance > 0) {
    const fraction = Math.min(1, (HELI.turretSpeed * Math.max(0, dt)) / distance);
    actual.yaw += yaw * fraction;
    actual.pitch += pitch * fraction;
    clampHeliAim(actual);
  }
  Object.assign(pending, actual);
  return actual;
}
export function rotateLocal(q: readonly number[], [x, y, z]: readonly number[]): Vec3 {
  const [qx, qy, qz, qw] = q,
    tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}
export function heliWeaponOrigin(
  vehicle: { state: { p: readonly number[]; q: readonly number[] } },
  weapon: string,
  side = 1,
): number[] {
  // Front of the H2's rocket pods and missile rails, mirrored for side -1.
  const [x, y, z] = VEHICLE_ANCHORS.helicopter[weapon === 'rocket' ? 'rocket' : 'missile'];
  const local = [side * x, y, z];
  const offset = rotateLocal(
    vehicle.state.q,
    local.map((v) => v * ACTOR_UNIT),
  );
  return vehicle.state.p.map((v, i) => v + offset[i]);
}
// Rotorcraft instructor: tilt accelerates horizontally, collective controls
// vertical speed; neutral input levels and brakes progressively to a hover.
export function stepHelicopter<S extends HelicopterState>(
  T: Three,
  state: S,
  controls: HelicopterControls,
  colliders: readonly Collider[],
  dt: number,
  profile: HelicopterProfile,
): S {
  if (state.hp <= 0) return state;
  const p = new T.Vector3().fromArray(state.p),
    before = p.clone(),
    v = new T.Vector3().fromArray(state.v),
    q = new T.Quaternion().fromArray(state.q);
  const powered = state.engine && state.fuelAvailable !== false;
  let rotorPower = state.rotorPower ?? 1;
  const rotorTarget = powered && controls.occupied !== false ? 1 : 0;
  rotorPower += (rotorTarget - rotorPower) * (1 - Math.exp(-dt * (rotorTarget ? 2 : 0.8)));
  const input = powered ? Math.max(-1, Math.min(1, controls.collective || 0)) : 0;
  let collective = Number.isFinite(state.collective) ? state.collective! : 0;
  collective += (input - collective) * (1 - Math.exp(-dt * 2.5));
  const dir = controls.direction
    ? new T.Vector3().fromArray(controls.direction as number[]).normalize()
    : new T.Vector3(0, 0, -1).applyQuaternion(q);
  const yaw = controls.direction
    ? Math.atan2(-dir.x, -dir.z)
    : new T.Euler().setFromQuaternion(q, 'YXZ').y -
      // Lead angle: the orientation slerps at 2/s, so this turns at yawRate rad/s.
      (Math.max(-1, Math.min(1, controls.yaw || 0)) * HELI.yawRate) / 2;
  const pitch =
    controls.pitch !== undefined
      ? Math.max(-1, Math.min(1, controls.pitch)) * HELI.maxTilt
      : controls.direction
        ? Math.max(
            -HELI.maxTilt,
            Math.min(HELI.maxTilt, Math.asin(Math.max(-1, Math.min(1, dir.y)))),
          )
        : 0;
  const roll =
    controls.roll !== undefined
      ? Math.max(-1, Math.min(1, controls.roll)) * HELI.maxTilt
      : controls.direction
        ? Math.max(
            -HELI.maxTilt,
            Math.min(
              HELI.maxTilt,
              new T.Vector3(0, 0, -1).applyQuaternion(q).cross(dir).y * -HELI.maxTilt,
            ),
          )
        : 0;
  // One tilt budget for both axes: diagonal input cannot exceed 45 degrees.
  const tilt = new T.Vector3(pitch, 0, roll);
  const angle = Math.min(HELI.maxTilt, tilt.length());
  const target = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  if (angle > 0) target.multiply(new T.Quaternion().setFromAxisAngle(tilt.normalize(), angle));
  q.slerp(target, 1 - Math.exp(-dt * 2));
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
  // Slerping across a large heading change can leave the cone even when both
  // endpoints are inside it. Bound the actual orientation as well as the target.
  if (up.y < Math.cos(HELI.maxTilt)) {
    const limited = new T.Vector3(up.x, 0, up.z);
    if (limited.lengthSq() < 1e-12) limited.set(0, 0, 1);
    limited.normalize().multiplyScalar(Math.sin(HELI.maxTilt));
    limited.y = Math.cos(HELI.maxTilt);
    q.premultiply(new T.Quaternion().setFromUnitVectors(up, limited)).normalize();
    up.copy(limited);
  }
  if (powered) {
    v.x += (up.x * MAP.metres(30) - v.x * 0.28) * dt;
    v.z += (up.z * MAP.metres(30) - v.z * 0.28) * dt;
    v.y +=
      (collective * MAP.metres(collective < 0 ? HELI.descentSpeed : 8) - v.y) *
      Math.min(1, dt * 2 * rotorPower);
  } else v.y -= MAP.metres(9.81) * dt;
  if (powered) v.y -= MAP.metres(9.81) * (1 - rotorPower) * dt;
  const max = MAP.metres(profile.maxSpeed),
    horizontal = Math.hypot(v.x, v.z);
  if (horizontal > max) {
    v.x *= max / horizontal;
    v.z *= max / horizontal;
  }
  if (powered && v.length() > max) v.setLength(max);
  p.addScaledVector(v, dt);
  let support = 0;
  for (const b of colliders)
    if (before.y - profile.gear >= b.max.y - MAP.metres(0.15) && colliderContainsXZ(b, p.x, p.z))
      support = Math.max(support, b.max.y);
  let landed = false;
  if (p.y - profile.gear <= support + (state.landed ? MAP.metres(0.03) : 1e-9) && v.y <= 0) {
    if (v.y < -MAP.metres(8)) state.hp = 0;
    p.y = support + profile.gear;
    v.y = 0;
    v.x *= Math.exp(-dt * 4);
    v.z *= Math.exp(-dt * 4);
    landed = true;
  }
  if (
    colliders.some(
      (b) =>
        segmentBox(before.toArray(), p.toArray(), b) !== null &&
        !(landed && Math.abs(b.max.y - support) < 1e-6),
    ) ||
    // No ceiling: above the clouds lies Saint Pierre's sky (src/sky-passage.ts).
    outOfFlight(p, OFFICE_LAYOUT.bounds)
  )
    state.hp = 0;
  Object.assign(state, {
    p: p.toArray(),
    q: q.toArray(),
    v: v.toArray(),
    landed,
    collective,
    rotorPower,
    gas: powered ? (collective + 1) / 2 : 0,
    omega: [0, 0, 0],
  });
  return state;
}
// Bounded turn towards the gunner's aim point; no target acquisition.
export function steerMissile(
  projectile: { p: readonly number[]; v: number[] },
  target: readonly number[],
  dt: number,
): void {
  const speed = Math.hypot(...projectile.v),
    desired = target.map((v, i) => v - projectile.p[i]);
  const n = Math.hypot(...desired);
  if (n < 1e-10 || speed < 1e-10) return;
  const a = projectile.v.map((v) => v / speed),
    b = desired.map((v) => v / n);
  const dot = Math.max(
      -1,
      Math.min(
        1,
        a.reduce((s, v, i) => s + v * b[i], 0),
      ),
    ),
    angle = Math.acos(dot),
    step = Math.min(angle, HELI.missileTurn * dt);
  if (angle < 1e-8) return;
  let ortho = b.map((v, i) => v - a[i] * dot),
    length = Math.hypot(...ortho);
  if (length < 1e-9) {
    ortho = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0];
    length = Math.hypot(...ortho);
  }
  projectile.v = a.map(
    (v, i) => (v * Math.cos(step) + (ortho[i] / length) * Math.sin(step)) * speed,
  );
}
