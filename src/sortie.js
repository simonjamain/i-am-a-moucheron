import { stepFall } from './ballistics.js';
import { MAP, ACTOR_UNIT, REFERENCE, FLAK } from './scale.js';
// Small vehicles keep their original dimensions; furniture uses the enlarged room.
import { OFFICE_LAYOUT, ROOM_SCALE } from './layout.js';
export const BULLET_SPEED = MAP.metres(REFERENCE.bullet),
  FIRE_INTERVAL = 0.06,
  GEAR_HEIGHT = 1.05 * ACTOR_UNIT;
const b = OFFICE_LAYOUT.base;
export const AA_STATIONS = [
  {
    x: b.originX - 32 * ACTOR_UNIT,
    y: b.deckY,
    z: b.originZ + 1 * ACTOR_UNIT,
    name: 'Alpha Ouest',
  },
  { x: b.originX + 32 * ACTOR_UNIT, y: b.deckY, z: b.originZ + 1 * ACTOR_UNIT, name: 'Alpha Est' },
  { x: 1.7, y: 0.90005, z: -1.02, name: 'Bureau Bravo' },
  { x: 0.85, y: 0.206, z: 2.35, name: 'Carton' },
  { x: 0.1, y: 0.00005, z: -0.8, name: 'Ventilateur' },
  { x: 2.2, y: 0.00005, z: -2.65, name: 'Poubelle' },
];
export function stationAccess(p, station, radius = MAP.metres(3.4)) {
  return (
    !!p &&
    Math.abs(p.y - station.y) < MAP.metres(2.5) &&
    Math.hypot(p.x - station.x, p.z - station.z) < radius
  );
}
// Swept contact with horizontal surfaces. Hard, inverted and side-on arrivals
// remain crashes; a gentle wheels-first touchdown becomes rolling contact.
export function resolveLanding(T, state, previous, colliders, dt) {
  const { position: p, vel, q, omega } = state;
  const gear = state.gear ?? GEAR_HEIGHT;
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
  const surfaces = [
    {
      min: { x: -OFFICE_LAYOUT.bounds.x, y: -0.08, z: -OFFICE_LAYOUT.bounds.z },
      max: { x: OFFICE_LAYOUT.bounds.x, y: 0, z: OFFICE_LAYOUT.bounds.z },
    },
    ...colliders,
  ];
  let top = -Infinity;
  for (const box of surfaces) {
    if (
      p.x < box.min.x + 0.5 * ACTOR_UNIT ||
      p.x > box.max.x - 0.5 * ACTOR_UNIT ||
      p.z < box.min.z + 0.5 * ACTOR_UNIT ||
      p.z > box.max.z - 0.5 * ACTOR_UNIT
    )
      continue;
    const y = box.max.y + gear;
    if (previous.y >= y - 0.12 * ACTOR_UNIT && p.y <= y + 0.1 * ACTOR_UNIT && y > top) top = y;
  }
  if (!Number.isFinite(top)) return { landed: false, contact: false };
  const safe = up.y > 0.88 && vel.y > -MAP.metres(5) && Math.hypot(vel.x, vel.z) < MAP.metres(28);
  if (!safe) return { landed: false, contact: true, hard: true };
  p.y = top;
  vel.y = 0;
  const e = new T.Euler().setFromQuaternion(q, 'YXZ');
  e.x *= Math.exp(-10 * dt);
  e.z *= Math.exp(-10 * dt);
  q.setFromEuler(e);
  omega.x *= 0.7;
  omega.z *= 0.7;
  return { landed: true, contact: true };
}
// World-space walking / deployed parachute. Ownership stays on the client.
export function stepWalker(body, dt, colliders) {
  const origin = OFFICE_LAYOUT.base;
  let x = origin.originX + body.x * ACTOR_UNIT,
    z = origin.originZ - body.z * ACTOR_UNIT;
  body.y ??= origin.deckY;
  body.vy ??= 0;
  const previousY = body.y;
  stepFall(body, dt);
  body.grounded = false;
  let top = 0;
  for (const box of colliders) {
    if (
      x >= box.min.x &&
      x <= box.max.x &&
      z >= box.min.z &&
      z <= box.max.z &&
      box.max.y <= previousY + 0.15 * ACTOR_UNIT
    )
      top = Math.max(top, box.max.y);
  }
  if (body.y <= top + 0.05 * ACTOR_UNIT) {
    body.y = top + 0.05 * ACTOR_UNIT;
    body.vy = 0;
    body.parachute = false;
    body.grounded = true;
  }
  // Chest-height walls stop the walker. Walkable tabletops do not block it.
  for (const box of colliders) {
    if (box.max.y < body.y + 0.25 * ACTOR_UNIT || box.min.y > body.y + 1.7 * ACTOR_UNIT) continue;
    const px = Math.min(x - box.min.x + body.r * ACTOR_UNIT, box.max.x + body.r * ACTOR_UNIT - x),
      pz = Math.min(z - box.min.z + body.r * ACTOR_UNIT, box.max.z + body.r * ACTOR_UNIT - z);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) {
      x += (x < (box.min.x + box.max.x) / 2 ? -1 : 1) * px;
      body.vx = 0;
    } else {
      z += (z < (box.min.z + box.max.z) / 2 ? -1 : 1) * pz;
      body.vz = 0;
    }
  }
  body.x = (x - origin.originX) / ACTOR_UNIT;
  body.z = (origin.originZ - z) / ACTOR_UNIT;
}
export function makeAntiaircraft(T, scene, graphics, stations = AA_STATIONS) {
  const { box, cyl } = graphics;
  return stations.map((station) => {
    const root = new T.Group();
    root.position.set(station.x, station.y, station.z);
    scene.add(root);
    cyl(0, 0.18, 0, 1.8, 2, 0.36, '#384a3c', root);
    for (const x of [-1, 1]) box(x, 0.38, 0, 0.4, 0.4, 2.8, '#5b6b47', root);
    root.scale.setScalar(MAP.ratio);
    const yaw = new T.Group();
    root.add(yaw);
    yaw.position.y = 0.75;
    cyl(0, 0, 0, 1.05, 1.15, 0.25, '#6b7b51', yaw);
    const pitch = new T.Group();
    yaw.add(pitch);
    pitch.position.y = 0.65;
    box(0, -0.25, 0.2, 1.1, 0.7, 1.1, '#64734c', yaw);
    const muzzles = [];
    for (const x of [-0.36, 0.36]) {
      cyl(x, 0, -1.2, 0.09, 0.09, 2.4, '#283c35', pitch).rotation.x = Math.PI / 2;
      box(x, 0, -2.4, 0.22, 0.22, 0.25, '#1a3028', pitch);
      const muzzle = new T.Object3D();
      muzzle.position.set(x, 0, -2.55);
      pitch.add(muzzle);
      muzzles.push(muzzle);
    }
    box(0, 0.1, 0.6, 0.8, 0.5, 0.08, '#adba91', yaw);
    box(0, -0.35, 1, 0.65, 0.12, 0.65, '#b2a572', yaw);
    for (const x of [-0.65, 0.65]) {
      box(x, 0.35, 0, 0.16, 0.9, 0.65, '#485d46', yaw);
      box(x, 0.4, -0.4, 0.45, 0.55, 0.14, '#83936b', pitch);
    }
    root.userData = { yaw, pitch, muzzles, barrel: 0 };
    return root;
  });
}

// Match visible yaw/elevation to the actual projectile direction, without roll.
export function aimGun(T, mount, worldDirection, parentQuaternion = null) {
  const d = worldDirection.clone().normalize();
  if (parentQuaternion) d.applyQuaternion(parentQuaternion.clone().invert());
  mount.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
  mount.userData.pitch.rotation.set(Math.asin(Math.max(-1, Math.min(1, d.y))), 0, 0);
  mount.updateWorldMatrix(true, true);
}
export function gunnerView(T, mount, direction, up) {
  const right = direction.clone().cross(up).normalize(),
    horizontal = direction.clone().addScaledVector(up, -direction.dot(up)).normalize(),
    origin = mount.getWorldPosition(new T.Vector3()),
    muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3()),
    eye = origin
      .clone()
      .addScaledVector(horizontal, -MAP.metres(2.1))
      .addScaledVector(right, MAP.metres(0.85))
      .addScaledVector(up, MAP.metres(1.2));
  return { eye, muzzle, target: muzzle.clone().addScaledVector(direction, MAP.metres(100)) };
}
