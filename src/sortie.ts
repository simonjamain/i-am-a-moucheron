import { colliderContainsXZ, colliderPushXZ } from './oriented-collider.ts';
import { isFortification } from './ground-fortifications.ts';
import { stepWalkerFall, impactDamage } from './field-physics.ts';
import { MAP, ACTOR_UNIT, REFERENCE, FLAK } from './scale.ts';
// Small vehicles keep their original dimensions; furniture uses the enlarged room.
import { OFFICE_LAYOUT, ROOM_SCALE } from './layout.ts';
import type * as THREE from 'three';
import type { Collider } from './oriented-collider.ts';
import type { WalkerBody } from './field-physics.ts';
import type { Three, XYZ } from './types.ts';
import { OFFICE_FRAME } from './base.ts';
import type { ArenaFrame } from './arena-frame.ts';

/** A manned station (fixed anti-aircraft gun, fortification, howitzer…). */
export interface Station extends XYZ {
  kind?: string;
  name?: string;
}
/** Aircraft state handed to resolveLanding (mutated on touchdown). */
export interface LandingState {
  position: THREE.Vector3;
  vel: THREE.Vector3;
  q: THREE.Quaternion;
  omega: THREE.Vector3;
  gear?: number;
}
export interface LandingResult {
  landed: boolean;
  contact: boolean;
  hard?: boolean;
}
/** Walking / parachuting body: x and z in actor units from the base origin. */
export interface Walker extends WalkerBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Radius in actor units. */
  r: number;
  grounded?: boolean;
}
export interface WalkerImpact {
  speed: number;
  damage: number;
}
/** Mesh builders from createGraphics (graphics.js). */
export interface StationGraphics {
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    parent?: THREE.Object3D,
  ): THREE.Mesh;
  cyl(
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    c: string,
    parent?: THREE.Object3D,
  ): THREE.Mesh;
}
export const BULLET_SPEED = MAP.metres(REFERENCE.bullet),
  FIRE_INTERVAL = 0.06,
  GEAR_HEIGHT = 1.05 * ACTOR_UNIT;
const b = OFFICE_LAYOUT.base;
export const AA_STATIONS: Station[] = [
  {
    x: b.originX - 32 * ACTOR_UNIT,
    y: b.deckY,
    z: b.originZ + 1 * ACTOR_UNIT,
    name: 'Alpha Ouest',
  },
  { x: b.originX + 32 * ACTOR_UNIT, y: b.deckY, z: b.originZ + 1 * ACTOR_UNIT, name: 'Alpha Est' },
  { x: 1.7, y: 0.90005, z: -1.02, name: 'Bureau Bravo' },
  { x: 0.85, y: 0.206, z: 2.35, name: 'Carton' },
  { x: 0.1, y: 0.00005, z: -0.8, name: 'Sol central' },
  { x: 2.2, y: 0.00005, z: -2.65, name: 'Poubelle' },
];
// Where the entry circle sits, beside the station (+X), inside its access
// radius. The player-scale howitzer (#113) sweeps 3.4 m around its axle: its
// circle stands just outside that sweep.
export function stationEntryOffset(station: Station | null | undefined): number {
  return station?.kind === 'antitank'
    ? MAP.metres(4.5)
    : isFortification(station?.kind)
      ? 0.08
      : MAP.metres(station?.kind === 'dcaHeavy' ? 4.5 : 3);
}
export function stationAccess(
  p: XYZ | null | undefined,
  station: Station | null | undefined,
  radius = station?.kind === 'antitank'
    ? MAP.metres(6)
    : isFortification(station?.kind)
      ? 0.09
      : MAP.metres(station?.kind === 'dcaHeavy' ? 5.2 : 3.4),
): boolean {
  return (
    !!p &&
    !!station &&
    Math.abs(p.y - station.y) < MAP.metres(2.5) &&
    Math.hypot(p.x - station.x, p.z - station.z) < radius
  );
}
export function stationExit(station: Station): XYZ {
  return {
    x:
      station.x +
      (station.kind === 'antitank'
        ? stationEntryOffset(station)
        : isFortification(station.kind)
          ? 0.09
          : stationEntryOffset(station)),
    y: station.y + 0.05 * ACTOR_UNIT,
    z: station.z,
  };
}
/** The decor's triangle colliders, as used by the walker and the landing gear. */
export interface DecorQuery {
  supportBelow(x: number, from: number, z: number, depth: number, flat?: number): number | null;
  nearest(
    point: readonly number[],
    radius?: number,
  ): { distance: number; point: readonly number[] } | null;
}
/** The colliders without the boxes of the pack props when the decor stands for them. */
export const withoutDecor = <C extends Collider>(
  colliders: readonly C[],
  decor: unknown,
): readonly C[] =>
  decor ? colliders.filter((b) => !(b as C & { decor?: boolean }).decor) : colliders;
// Swept contact with horizontal surfaces. Hard, inverted and side-on arrivals
// remain crashes; a gentle wheels-first touchdown becomes rolling contact.
export function resolveLanding(
  T: Three,
  state: LandingState,
  previous: XYZ,
  allColliders: readonly Collider[],
  dt: number,
  decor?: DecorQuery | null,
): LandingResult {
  // With the decor world, props land on their real surfaces, not their boxes.
  const colliders = withoutDecor(allColliders, decor);
  const { position: p, vel, q, omega } = state;
  const gear = state.gear ?? GEAR_HEIGHT;
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
  const surfaces: Collider[] = [
    {
      min: { x: -OFFICE_LAYOUT.bounds.x, y: -0.08, z: -OFFICE_LAYOUT.bounds.z },
      max: { x: OFFICE_LAYOUT.bounds.x, y: 0, z: OFFICE_LAYOUT.bounds.z },
    },
    ...colliders,
  ];
  let top = -Infinity;
  for (const box of surfaces) {
    if (!colliderContainsXZ(box, p.x, p.z, -0.5 * ACTOR_UNIT)) continue;
    const y = box.max.y + gear;
    if (previous.y >= y - 0.12 * ACTOR_UNIT && p.y <= y + 0.1 * ACTOR_UNIT && y > top) top = y;
  }
  if (decor) {
    // Same window as the boxes: wheels between 0.12 above and 0.1 below contact.
    const from = Math.max(previous.y, p.y) - gear + 0.12 * ACTOR_UNIT;
    const surface = decor.supportBelow(p.x, from, p.z, from - (p.y - gear - 0.1 * ACTOR_UNIT));
    if (surface !== null) {
      const y = surface + gear;
      if (previous.y >= y - 0.12 * ACTOR_UNIT && p.y <= y + 0.1 * ACTOR_UNIT && y > top) top = y;
    }
  }
  if (!Number.isFinite(top) || vel.y > 0) return { landed: false, contact: false };
  const safe = up.y > 0.88 && vel.y > -MAP.metres(5);
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
// World-space walking / deployed parachute, in any walking arena (`frame`: the
// office deck by default, Saint Pierre's cloud). Heights are world heights of the
// same person everywhere (ACTOR_UNIT); only the arena's planar axes come from the
// frame. Ownership stays on the client.
export function stepWalker(
  body: Walker,
  dt: number,
  allColliders: readonly Collider[],
  decor?: DecorQuery | null,
  frame: ArenaFrame = OFFICE_FRAME,
): WalkerImpact | null {
  const colliders = withoutDecor(allColliders, decor);
  // World z = originZ + side * arena z.
  const side = frame.mirrorZ ? -1 : 1;
  let x = frame.originX + body.x * frame.unit,
    z = frame.originZ + side * body.z * frame.unit;
  body.y ??= frame.originY;
  body.vy ??= 0;
  const previousY = body.y;
  let top = 0;
  for (const box of colliders) {
    if (colliderContainsXZ(box, x, z) && box.max.y <= previousY + 0.15 * ACTOR_UNIT)
      top = Math.max(top, box.max.y);
  }
  if (decor) {
    const from = previousY + 0.15 * ACTOR_UNIT;
    const surface = decor.supportBelow(x, from, z, from);
    if (surface !== null) top = Math.max(top, surface);
  }
  let impact: WalkerImpact | null = null;
  const contactY = top + 0.05 * ACTOR_UNIT;
  const supported = body.grounded && Math.abs(previousY - contactY) < 0.15 * ACTOR_UNIT;
  if (supported) {
    body.y = contactY;
    body.vy = 0;
    body.parachute = false;
    body.canopyInflation = 0;
  } else {
    body.grounded = false;
    const steps = Math.max(1, Math.ceil(dt * 240));
    for (let step = 0; step < steps; step++) {
      stepWalkerFall(body, dt / steps);
      if (body.y <= contactY) {
        const speed = Math.max(0, -body.vy);
        impact = { speed, damage: impactDamage(speed) };
        body.canopyInflation = 0;
        body.y = contactY;
        body.vy = 0;
        body.parachute = false;
        body.grounded = true;
        break;
      }
    }
  }
  // Chest-height walls stop the walker. Walkable tabletops do not block it.
  for (const box of colliders) {
    if (box.max.y < body.y + 0.25 * ACTOR_UNIT || box.min.y > body.y + 1.7 * ACTOR_UNIT) continue;
    const pushed = colliderPushXZ(box, x, z, body.r * frame.unit);
    if (!pushed) continue;
    x = pushed.x;
    z = pushed.z;
    // Remove only velocity into the contact face (world z = side * body z).
    const normalSpeed = body.vx * pushed.nx + side * body.vz * pushed.nz;
    if (!box.oriented) {
      if (pushed.nx) body.vx = 0;
      else body.vz = 0;
    } else if (normalSpeed < 0) {
      body.vx -= normalSpeed * pushed.nx;
      body.vz -= side * normalSpeed * pushed.nz;
    }
  }
  // The decor's faces near the legs, chest and head push the walker out, like the
  // sides of the boxes; what lies under or over it (support, a table top) does not.
  if (decor) {
    const radius = body.r * frame.unit;
    for (const h of [0.4, 0.9, 1.5]) {
      const near = decor.nearest([x, body.y + h * ACTOR_UNIT, z], radius);
      if (!near) continue;
      const dx = x - near.point[0],
        dz = z - near.point[2];
      const flat = Math.hypot(dx, dz);
      if (flat < 1e-7 || flat < 0.5 * near.distance) continue;
      const nx = dx / flat,
        nz = dz / flat;
      x = near.point[0] + nx * radius;
      z = near.point[2] + nz * radius;
      const normalSpeed = body.vx * nx + side * body.vz * nz;
      if (normalSpeed < 0) {
        body.vx -= normalSpeed * nx;
        body.vz -= side * normalSpeed * nz;
      }
    }
  }
  body.x = (x - frame.originX) / frame.unit;
  body.z = (frame.mirrorZ ? frame.originZ - z : z - frame.originZ) / frame.unit;
  return impact;
}
export function makeAntiaircraft(
  T: Three,
  scene: THREE.Object3D,
  graphics: StationGraphics,
  stations: readonly Station[] = AA_STATIONS,
): THREE.Group[] {
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
    const muzzles: THREE.Object3D[] = [];
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
export function aimGun(
  T: Three,
  mount: THREE.Object3D,
  worldDirection: THREE.Vector3,
  parentQuaternion: THREE.Quaternion | null = null,
): void {
  const d = worldDirection.clone().normalize();
  if (parentQuaternion) d.applyQuaternion(parentQuaternion.clone().invert());
  mount.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
  mount.userData.pitch.rotation.set(Math.asin(Math.max(-1, Math.min(1, d.y))), 0, 0);
  mount.updateWorldMatrix(true, true);
}
export function gunnerView(
  T: Three,
  mount: THREE.Object3D,
  direction: THREE.Vector3,
  up: THREE.Vector3,
  ventral = false,
): { eye: THREE.Vector3; muzzle: THREE.Vector3; target: THREE.Vector3 } {
  const right = direction.clone().cross(up).normalize(),
    horizontal = direction.clone().addScaledVector(up, -direction.dot(up)).normalize(),
    origin = mount.getWorldPosition(new T.Vector3()),
    muzzle = mount.userData.muzzle.getWorldPosition(new T.Vector3()),
    eye = origin
      .clone()
      .addScaledVector(horizontal, -MAP.metres(2.1))
      .addScaledVector(right, MAP.metres(0.85))
      .addScaledVector(up, MAP.metres(ventral ? -1.2 : 1.2));
  return { eye, muzzle, target: muzzle.clone().addScaledVector(direction, MAP.metres(100)) };
}
