import { rotateLocal } from './helicopter.js';
import { VEHICLES } from './fleet.js';
import { MAP, ACTOR_UNIT } from './scale.js';
export { sweptBoxProximity, sweptSphereProximity } from './swept-geometry.js';
import { sweptBoxProximity } from './swept-geometry.js';
export const MOBILE_FUSE = Object.freeze({
  min: 0.5,
  max: 20,
  step: 0.5,
  initial: 5,
  armedAt: 0.3,
});
export const clampProximity = (value) =>
  Math.max(
    MOBILE_FUSE.min,
    Math.min(MOBILE_FUSE.max, Number.isFinite(value) ? value : MOBILE_FUSE.initial),
  );
export function mobileBarrelOrigin(vehicle, direction) {
  const q = vehicle.state.q;
  const angle = vehicle.state.trailerAngle || 0;
  const local = [
    Math.sin(angle) * ACTOR_UNIT * 3.2,
    ACTOR_UNIT,
    ACTOR_UNIT * (-0.7 + Math.cos(angle) * 3.2),
  ];
  // Quaternion rotation, shared by the model and authoritative projectile.
  const [x, y, z] = local,
    [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  const offset = [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
  return vehicle.state.p.map((v, i) => v + offset[i] + direction[i] * 2.8 * ACTOR_UNIT);
}
export function fuseSegment(a, b, ageBefore, ageAfter) {
  if (ageAfter < MOBILE_FUSE.armedAt - 1e-12) return null;
  const t = Math.max(
    0,
    Math.min(1, (MOBILE_FUSE.armedAt - ageBefore) / Math.max(1e-14, ageAfter - ageBefore)),
  );
  return { a: a.map((v, i) => v + (b[i] - v) * t), t };
}
export const proximityRadius = (value) => MAP.metres(clampProximity(value));

// Physical hull envelopes; decorative labels and projectiles are not colliders.
// Test in local coordinates so an articulated trailer follows its own axis.
export function sweptVehicle(a, b, vehicle, radius = 0) {
  const q = vehicle.state.q,
    inverse = [-q[0], -q[1], -q[2], q[3]];
  const local = (p) =>
    rotateLocal(
      inverse,
      p.map((v, i) => v - vehicle.state.p[i]),
    );
  const A = local(a),
    B = local(b),
    profile = VEHICLES[vehicle.type];
  if (vehicle.type !== 'flaktruck')
    return sweptBoxProximity(
      A,
      B,
      {
        min: {
          x: -MAP.metres(profile.span / 2),
          y: -profile.gear,
          z: -MAP.metres(profile.length / 2),
        },
        max: {
          x: MAP.metres(profile.span / 2),
          y: MAP.metres(2),
          z: MAP.metres(profile.length / 2),
        },
      },
      radius,
    );
  const scale = (lo, hi) => ({
    min: { x: lo[0] * ACTOR_UNIT, y: lo[1] * ACTOR_UNIT, z: lo[2] * ACTOR_UNIT },
    max: { x: hi[0] * ACTOR_UNIT, y: hi[1] * ACTOR_UNIT, z: hi[2] * ACTOR_UNIT },
  });
  const tractor = sweptBoxProximity(A, B, scale([-1.15, -0.8, -4], [1.15, 1.7, -0.6]), radius);
  const angle = -(vehicle.state.trailerAngle || 0),
    c = Math.cos(angle),
    sn = Math.sin(angle);
  const trailer = (p) => {
    const z = p[2] + 0.7 * ACTOR_UNIT;
    return [c * p[0] + sn * z, p[1], -sn * p[0] + c * z];
  };
  const t = sweptBoxProximity(
    trailer(A),
    trailer(B),
    scale([-1.2, -0.8, -0.4], [1.2, 1.7, 5]),
    radius,
  );
  return tractor === null ? t : t === null ? tractor : Math.min(tractor, t);
}
