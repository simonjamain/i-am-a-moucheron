import { tankBarrelOrigin } from './tank-view.js';
import { MAP } from './scale.js';
import { HEAVY } from './armament.js';
export const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
export function segmentSphere(a, b, centre, radius) {
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
export function segmentBox(a, b, box) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const k = ['x', 'y', 'z'][i],
      d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < box.min[k] || a[i] > box.max[k]) return null;
    } else {
      let x = (box.min[k] - a[i]) / d,
        y = (box.max[k] - a[i]) / d;
      if (x > y) [x, y] = [y, x];
      lo = Math.max(lo, x);
      hi = Math.min(hi, y);
      if (lo > hi) return null;
    }
  }
  return lo;
}
export function integrateOrdnance(projectile, dt) {
  const before = [...projectile.p];
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
export function createOrdnance({ shot, weapon, vehicle, shooter, direction, now, wave }) {
  const profile = HEAVY[weapon],
    q = vehicle.state.q;
  const forward = [
    -2 * (q[0] * q[2] + q[3] * q[1]),
    -2 * (q[1] * q[2] - q[3] * q[0]),
    -(1 - 2 * (q[0] * q[0] + q[1] * q[1])),
  ];
  const n = Math.hypot(...direction) || 1,
    dir = direction.map((v) => v / n);
  const p =
    weapon === 'bomb'
      ? vehicle.state.p.map((v, i) => v + (i === 1 ? -MAP.metres(1.5) : 0))
      : tankBarrelOrigin(vehicle, dir);
  const v =
    weapon === 'bomb'
      ? [...vehicle.state.v]
      : dir.map((v, i) => v * profile.speed + vehicle.state.v[i]);
  return {
    shot,
    weapon,
    vehicle: vehicle.id,
    shooter,
    p,
    v,
    age: 0,
    at: now,
    updated: now,
    wave,
    bonus: weapon === 'bomb' && forward[1] < -0.65 ? 1.35 : 1,
  };
}
