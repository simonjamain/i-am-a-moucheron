import { ACTOR_UNIT } from './scale.js';
import { rotateLocal } from './helicopter.js';
import { VEHICLE_ANCHORS } from './vehicle-anchors.js';
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
  return {
    eye: muzzle.clone().addScaledVector(direction, -0.5 * ACTOR_UNIT),
    target: muzzle.clone().addScaledVector(direction, 100 * ACTOR_UNIT),
    muzzle: coax,
    observing: false,
  };
}
// Shell origin: the turret's elevation pivot plus the barrel along the aim,
// the same points the T3 model draws (scripts/import-meshy-vehicle.py).
export function tankBarrelOrigin(vehicle, direction) {
  const { gunPivot, gunLength } = VEHICLE_ANCHORS.tank;
  const offset = rotateLocal(
    vehicle.state.q,
    gunPivot.map((v) => v * ACTOR_UNIT),
  );
  return vehicle.state.p.map((v, i) => v + offset[i] + direction[i] * gunLength * ACTOR_UNIT);
}
