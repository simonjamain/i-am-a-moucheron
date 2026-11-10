import { rotateLocal } from './helicopter.js';
import { VEHICLES } from './fleet.js';
import { MAP, ACTOR_UNIT } from './scale.js';
import { VEHICLE_ANCHORS } from './vehicle-anchors.js';

// D2 geometry shared with its model: trailer hitch, gun pivot and hulls.
const D2 = VEHICLE_ANCHORS.flaktruck;
// Gun pivot in the vehicle frame for a trailer angle (trailer yaws at the hitch).
export function trailerGunPivot(angle) {
  const [x, y, z] = D2.gunOffset,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [D2.hitch[0] + x * c + z * s, D2.hitch[1] + y, D2.hitch[2] - x * s + z * c];
}
export {
  sweptBoxProximity,
  sweptSphereProximity,
  closestSphereProximity,
} from './swept-geometry.js';
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
  const local = trailerGunPivot(angle).map((v) => v * ACTOR_UNIT);
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
  return vehicle.state.p.map((v, i) => v + offset[i] + direction[i] * D2.gunLength * ACTOR_UNIT);
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
export function sweptVehicle(a, b, vehicle, radius = 0, closest = false) {
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
      closest,
    );
  const scale = (lo, hi) => ({
    min: { x: lo[0] * ACTOR_UNIT, y: lo[1] * ACTOR_UNIT, z: lo[2] * ACTOR_UNIT },
    max: { x: hi[0] * ACTOR_UNIT, y: hi[1] * ACTOR_UNIT, z: hi[2] * ACTOR_UNIT },
  });
  const tractor = sweptBoxProximity(A, B, scale(...D2.tractorBox), radius, closest);
  const angle = -(vehicle.state.trailerAngle || 0),
    c = Math.cos(angle),
    sn = Math.sin(angle);
  // Trailer frame: origin at the hitch, rotated with the trailer.
  const trailer = (p) => {
    const x = p[0] - D2.hitch[0] * ACTOR_UNIT,
      z = p[2] - D2.hitch[2] * ACTOR_UNIT;
    return [c * x + sn * z, p[1] - D2.hitch[1] * ACTOR_UNIT, -sn * x + c * z];
  };
  const t = sweptBoxProximity(trailer(A), trailer(B), scale(...D2.trailerBox), radius, closest);
  return tractor === null ? t : t === null ? tractor : Math.min(tractor, t);
}
