import { sweptBoxProximity } from './mobile-flak.js';
import { ACTOR_UNIT, MAP } from './scale.js';
// A tank follows support surfaces; gravity handles falling off a desk. No lift,
// automatic turret rotation or dependency on a driver for the other stations.
export function stepTank(T, state, controls, colliders, dt, profile) {
  const p = new T.Vector3().fromArray(state.p),
    v = new T.Vector3().fromArray(state.v),
    q = new T.Quaternion().fromArray(state.q);
  const throttle =
    state.fuelAvailable === false ? 0 : Math.max(-1, Math.min(1, controls.forward || 0));
  q.multiply(
    new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      (controls.turn || 0) * dt * profile.turn,
    ),
  );
  const forward = new T.Vector3(0, 0, -1).applyQuaternion(q),
    target = throttle * MAP.metres(profile.maxSpeed);
  const speed = v.dot(forward),
    next = speed + (target - speed) * Math.min(1, dt * 4);
  v.x = forward.x * next;
  v.z = forward.z * next;
  const before = p.clone();
  p.addScaledVector(v, dt);
  const radius = MAP.metres(profile.span * 0.35),
    bottom = before.y - profile.gear;
  for (const box of colliders) {
    if (box.max.y <= bottom + MAP.metres(0.2)) continue;
    if (p.y + MAP.metres(2) < box.min.y) continue;
    if (
      p.x > box.min.x - radius &&
      p.x < box.max.x + radius &&
      p.z > box.min.z - radius &&
      p.z < box.max.z + radius
    ) {
      p.x = before.x;
      p.z = before.z;
      v.x = v.z = 0;
      break;
    }
  }
  if (profile.articulated) {
    const points = [
      [0, -3.1],
      [0, -1.4],
    ];
    const angle = state.trailerAngle || 0;
    for (const z of [0.2, 1.4, 2.6, 3.8, 5])
      points.push([Math.sin(angle) * z, -0.7 + Math.cos(angle) * z]);
    const blocked = points.some(([x, z]) => {
      const offset = new T.Vector3(x * ACTOR_UNIT, 0, z * ACTOR_UNIT).applyQuaternion(q);
      const a = before.clone().add(offset).toArray(),
        b = p.clone().add(offset).toArray();
      return colliders.some(
        (box) =>
          box.max.y > bottom + MAP.metres(0.2) &&
          box.min.y < p.y + MAP.metres(3) &&
          sweptBoxProximity(a, b, box, 1.2 * ACTOR_UNIT) !== null,
      );
    });
    if (blocked) {
      p.x = before.x;
      p.z = before.z;
      v.x = v.z = 0;
    }
  }
  let support = 0;
  for (const box of colliders)
    if (
      box.max.y <= bottom + MAP.metres(0.25) &&
      p.x >= box.min.x &&
      p.x <= box.max.x &&
      p.z >= box.min.z &&
      p.z <= box.max.z
    )
      support = Math.max(support, box.max.y);
  if (p.y - profile.gear <= support + MAP.metres(0.05) && v.y <= 0) {
    if (v.y < -MAP.metres(20)) state.hp = 0;
    p.y = support + profile.gear;
    v.y = 0;
    state.landed = true;
  } else {
    v.y -= MAP.metres(9.81) * dt;
    state.landed = false;
  }
  if (profile.articulated) {
    const turn = (controls.turn || 0) * dt * profile.turn;
    state.trailerAngle = Math.max(-0.65, Math.min(0.65, (state.trailerAngle || 0) - turn));
    state.trailerAngle *= Math.exp((-Math.abs(next) / Math.max(MAP.metres(6), 1e-9)) * dt);
  }
  Object.assign(state, {
    p: p.toArray(),
    q: q.toArray(),
    v: v.toArray(),
    gas: Math.abs(throttle),
    omega: [0, 0, 0],
  });
  return state;
}
