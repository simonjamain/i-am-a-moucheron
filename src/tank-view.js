import { ACTOR_UNIT } from './scale.js';
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
export function tankBarrelOrigin(vehicle, direction) {
  const q = vehicle.state.q,
    u = [
      2 * (q[0] * q[1] - q[3] * q[2]),
      1 - 2 * (q[0] * q[0] + q[2] * q[2]),
      2 * (q[1] * q[2] + q[3] * q[0]),
    ];
  return vehicle.state.p.map((v, i) => v + u[i] * ACTOR_UNIT + direction[i] * 2.8 * ACTOR_UNIT);
}
