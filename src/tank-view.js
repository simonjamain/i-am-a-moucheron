import { ACTOR_UNIT } from './scale.ts';
import { vehicleUnit } from './fleet.ts';
import { rotateLocal } from './helicopter.js';
import { VEHICLE_ANCHORS } from './vehicle-anchors.ts';
// Position of the gunner's eye relative to the gun's pivot, in model units.
export const SIGHT = Object.freeze({ behind: 0.4, above: 0.75, left: 0 });
export function tankSight(T, mount, direction, up, observation = null) {
  mount.updateWorldMatrix(true, true);
  const muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3());
  const coax = mount.userData.coaxMuzzle.getWorldPosition(new T.Vector3());
  if (observation) {
    const center = mount.getWorldPosition(new T.Vector3()).addScaledVector(up, ACTOR_UNIT * 2);
    const offset = new T.Vector3(
      Math.sin(observation.yaw) * Math.cos(observation.pitch),
      Math.sin(observation.pitch),
      Math.cos(observation.yaw) * Math.cos(observation.pitch),
    ).multiplyScalar(9 * ACTOR_UNIT);
    return { eye: center.clone().add(offset), target: center, muzzle: coax, observing: true };
  }
  // Close behind and above the gun's pivot, in the gun's own frame (so the eye rises with the
  // barrel): the barrel is seen from above, under the sight, clear of the turret roof at any
  // elevation, and is seen kicking back when it fires.
  const anchor = mount.localToWorld(mount.userData.pitch.position.clone()),
    unit = vehicleUnit('tank'),
    right = direction.clone().cross(up).normalize(),
    // "Above" is perpendicular to the aim, so that the eye rises with the barrel and stays over
    // the turret roof when the gun is elevated.
    sightUp = up.clone().addScaledVector(direction, -up.dot(direction)).normalize();
  return {
    eye: anchor
      .clone()
      .addScaledVector(direction, -SIGHT.behind * unit)
      .addScaledVector(sightUp, SIGHT.above * unit)
      .addScaledVector(right, -SIGHT.left * unit),
    target: anchor.clone().addScaledVector(direction, 100 * ACTOR_UNIT),
    muzzle: coax,
    observing: false,
  };
}
// Shell origin: the gun's elevation pivot plus the barrel along the aim, the same points the T3
// model draws. The pivot is at the turret's front, so it swings with the turret's yaw (the turret
// turns about its own centre): the yaw is read from the aim, like `aimGun` does.
export function tankBarrelOrigin(vehicle, direction) {
  const { gunPivot, gunLength, turretPivot } = VEHICLE_ANCHORS.tank;
  const unit = vehicleUnit('tank');
  const q = vehicle.state.q;
  const local = rotateLocal([-q[0], -q[1], -q[2], q[3]], direction);
  const yaw = Math.atan2(-local[0], -local[2]),
    sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const [x, y, z] = gunPivot.map((v, i) => v - turretPivot[i]);
  const swung = [x * cos + z * sin, y, -x * sin + z * cos];
  const offset = rotateLocal(
    q,
    swung.map((v, i) => (v + turretPivot[i]) * unit),
  );
  return vehicle.state.p.map((v, i) => v + offset[i] + direction[i] * gunLength * unit);
}
