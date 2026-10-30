import { segmentBox } from './swept-geometry.js';
import { MAP, ACTOR_UNIT } from './scale.js';
import { OFFICE_LAYOUT } from './layout.js';
export const HELI = Object.freeze({
  gunInterval: 1 / 15,
  gunDamage: 75,
  maxTilt: (85 * Math.PI) / 180,
  turretSpeed: Math.PI,
  descentSpeed: 30,
  minPitch: -1.45,
  maxPitch: 0,
  missileTurn: 1.2,
});
export function clampHeliAim(aim) {
  aim.yaw = Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw));
  aim.pitch = Math.max(HELI.minPitch, Math.min(HELI.maxPitch, aim.pitch));
  return aim;
}
// Desired pointer aim and actual mount aim are distinct. Advance once per frame;
// shots, guidance and camera all use the same actual orientation.
export function stepHeliAim(actual, desired, dt) {
  clampHeliAim(desired);
  const yaw = Math.atan2(Math.sin(desired.yaw - actual.yaw), Math.cos(desired.yaw - actual.yaw));
  const pitch = desired.pitch - actual.pitch;
  const distance = Math.hypot(yaw, pitch);
  const fraction = distance ? Math.min(1, (HELI.turretSpeed * Math.max(0, dt)) / distance) : 0;
  actual.yaw += yaw * fraction;
  actual.pitch += pitch * fraction;
  return clampHeliAim(actual);
}
export function rotateLocal(q, [x, y, z]) {
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
export function heliWeaponOrigin(vehicle, weapon, side = 1) {
  const local = weapon === 'rocket' ? [side * 2.15, -0.3, -1.4] : [side * 1.15, -0.65, -1.8];
  const offset = rotateLocal(
    vehicle.state.q,
    local.map((v) => v * ACTOR_UNIT),
  );
  return vehicle.state.p.map((v, i) => v + offset[i]);
}
// Rotorcraft instructor: tilt accelerates horizontally, collective controls
// vertical speed; neutral input levels and brakes progressively to a hover.
export function stepHelicopter(T, state, controls, colliders, dt, profile) {
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
  let collective = Number.isFinite(state.collective) ? state.collective : 0;
  collective += (input - collective) * (1 - Math.exp(-dt * 2.5));
  const dir = controls.direction
    ? new T.Vector3().fromArray(controls.direction).normalize()
    : new T.Vector3(0, 0, -1).applyQuaternion(q);
  if (controls.direction && controls.factor === -1) {
    const local = dir.clone().applyQuaternion(q.clone().invert());
    local.x *= -1;
    local.y *= -1;
    dir.copy(local.applyQuaternion(q));
  }
  const yaw = controls.direction
    ? Math.atan2(-dir.x, -dir.z)
    : new T.Euler().setFromQuaternion(q, 'YXZ').y;
  const pitch = controls.direction
    ? Math.max(-HELI.maxTilt, Math.min(HELI.maxTilt, Math.asin(Math.max(-1, Math.min(1, dir.y)))))
    : 0;
  const roll = controls.direction
    ? Math.max(
        -HELI.maxTilt,
        Math.min(
          HELI.maxTilt,
          new T.Vector3(0, 0, -1).applyQuaternion(q).cross(dir).y * -HELI.maxTilt,
        ),
      )
    : 0;
  const target = new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ'));
  q.slerp(target, 1 - Math.exp(-dt * 2));
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
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
    if (
      before.y - profile.gear >= b.max.y - MAP.metres(0.15) &&
      p.x >= b.min.x &&
      p.x <= b.max.x &&
      p.z >= b.min.z &&
      p.z <= b.max.z
    )
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
    p.y > OFFICE_LAYOUT.bounds.ceiling ||
    Math.abs(p.x) > OFFICE_LAYOUT.bounds.x ||
    Math.abs(p.z) > OFFICE_LAYOUT.bounds.z
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
export function steerMissile(projectile, target, dt) {
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
