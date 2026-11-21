import type * as THREE from 'three';
import type { Three, XYZ } from './types.ts';

/** Yaw frame: rotation (c = cos, s = sin) around the box origin (x, z). */
export interface OrientedFrame {
  x: number;
  z: number;
  c: number;
  s: number;
  /** Local axis-aligned rectangle (a Box3 at runtime). */
  bounds: THREE.Box3;
}
/** Axis-aligned bounds, optionally carrying a yaw frame for narrow-phase tests. */
export interface Collider {
  min: XYZ;
  max: XYZ;
  oriented?: OrientedFrame;
}
export type OrientedBox3 = THREE.Box3 & { oriented: OrientedFrame };

// Optional yaw frame on a Box3: min/max remain a broad-phase world AABB.
// Narrow-phase queries use the local rectangle, preserving ordinary boxes.
export function colliderPoint(box: Collider, p: readonly number[]): readonly number[] {
  const f = box.oriented;
  if (!f) return p;
  const x = p[0] - f.x,
    z = p[2] - f.z;
  return [f.c * x - f.s * z, p[1], f.s * x + f.c * z];
}
export function colliderBounds(box: Collider): Collider {
  return box.oriented?.bounds || box;
}
export function colliderContainsXZ(box: Collider, x: number, z: number, margin = 0): boolean {
  const p = colliderPoint(box, [x, 0, z]),
    b = colliderBounds(box);
  return (
    p[0] >= b.min.x - margin &&
    p[0] <= b.max.x + margin &&
    p[2] >= b.min.z - margin &&
    p[2] <= b.max.z + margin
  );
}
export function colliderPushXZ(
  box: Collider,
  x: number,
  z: number,
  radius: number,
): { x: number; z: number; nx: number; nz: number } | null {
  const p = colliderPoint(box, [x, 0, z]),
    b = colliderBounds(box);
  const px = Math.min(p[0] - b.min.x + radius, b.max.x + radius - p[0]);
  const pz = Math.min(p[2] - b.min.z + radius, b.max.z + radius - p[2]);
  if (px <= 0 || pz <= 0) return null;
  let dx = 0,
    dz = 0;
  if (px < pz) dx = (p[0] < (b.min.x + b.max.x) / 2 ? -1 : 1) * px;
  else dz = (p[2] < (b.min.z + b.max.z) / 2 ? -1 : 1) * pz;
  const f = box.oriented;
  const wx = f ? f.c * dx + f.s * dz : dx;
  const wz = f ? -f.s * dx + f.c * dz : dz;
  const length = Math.hypot(wx, wz);
  return { x: x + wx, z: z + wz, nx: wx / length, nz: wz / length };
}
export function rayCollider(
  T: Three,
  ray: THREE.Ray,
  box: THREE.Box3 & { oriented?: OrientedFrame },
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const f = box.oriented;
  if (!f) return ray.intersectBox(box, target);
  const p = colliderPoint(box, ray.origin.toArray());
  const d = ray.direction;
  const localRay = new T.Ray(
    new T.Vector3(...p),
    new T.Vector3(f.c * d.x - f.s * d.z, d.y, f.s * d.x + f.c * d.z),
  );
  if (!localRay.intersectBox(f.bounds, target)) return null;
  const x = target.x,
    z = target.z;
  target.x = f.x + f.c * x + f.s * z;
  target.z = f.z - f.s * x + f.c * z;
  return target;
}
// Box3 adapters retain orientation through the existing clone/expand/contains
// paths used by aircraft and vacant hulls. Ray queries explicitly use the frame.
export function orientedBox(T: Three, broad: THREE.Box3, frame: OrientedFrame): OrientedBox3 {
  const box = broad as OrientedBox3;
  box.oriented = frame;
  box.containsPoint = function (this: OrientedBox3, p: THREE.Vector3) {
    return p.y >= this.min.y && p.y <= this.max.y && colliderContainsXZ(this, p.x, p.z);
  };
  box.clone = function (this: OrientedBox3) {
    return orientedBox(T, new T.Box3().copy(this), {
      ...this.oriented,
      bounds: this.oriented.bounds.clone(),
    });
  };
  box.expandByScalar = function (this: OrientedBox3, radius: number) {
    T.Box3.prototype.expandByScalar.call(this, radius);
    this.oriented.bounds.expandByScalar(radius);
    return this;
  };
  return box;
}

function rectangleCorners(
  x: number,
  z: number,
  rx: number,
  rz: number,
  c: number,
  s: number,
): Array<[number, number]> {
  return [
    [-rx, -rz],
    [-rx, rz],
    [rx, rz],
    [rx, -rz],
  ].map(([dx, dz]) => [x + c * dx + s * dz, z - s * dx + c * dz]);
}
export function footprintInsideCollider(
  box: Collider,
  point: { x: number; z: number },
  rx: number,
  rz: number,
  angle: number,
): boolean {
  return rectangleCorners(point.x, point.z, rx, rz, Math.cos(angle), Math.sin(angle)).every(
    ([x, z]) => colliderContainsXZ(box, x, z, 1e-9),
  );
}
export function footprintOverlapsCollider(
  box: Collider,
  point: { x: number; z: number },
  rx: number,
  rz: number,
  angle: number,
): boolean {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    f = box.oriented;
  const b = colliderBounds(box),
    bc = f?.c ?? 1,
    bs = f?.s ?? 0;
  const lx = (b.min.x + b.max.x) / 2,
    lz = (b.min.z + b.max.z) / 2;
  const x = f ? f.x + bc * lx + bs * lz : lx,
    z = f ? f.z - bs * lx + bc * lz : lz;
  const aPoints = rectangleCorners(point.x, point.z, rx, rz, c, s);
  const bPoints = rectangleCorners(x, z, (b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 2, bc, bs);
  for (const [ax, az] of [
    [c, -s],
    [s, c],
    [bc, -bs],
    [bs, bc],
  ]) {
    const a = aPoints.map((p) => p[0] * ax + p[1] * az),
      v = bPoints.map((p) => p[0] * ax + p[1] * az);
    if (Math.max(...a) <= Math.min(...v) || Math.max(...v) <= Math.min(...a)) return false;
  }
  return true;
}
