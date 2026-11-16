// Optional yaw frame on a Box3: min/max remain a broad-phase world AABB.
// Narrow-phase queries use the local rectangle, preserving ordinary boxes.
export function colliderPoint(box, p) {
  const f = box.oriented;
  if (!f) return p;
  const x = p[0] - f.x,
    z = p[2] - f.z;
  return [f.c * x - f.s * z, p[1], f.s * x + f.c * z];
}
export function colliderBounds(box) {
  return box.oriented?.bounds || box;
}
export function colliderContainsXZ(box, x, z, margin = 0) {
  const p = colliderPoint(box, [x, 0, z]),
    b = colliderBounds(box);
  return (
    p[0] >= b.min.x - margin &&
    p[0] <= b.max.x + margin &&
    p[2] >= b.min.z - margin &&
    p[2] <= b.max.z + margin
  );
}
export function colliderPushXZ(box, x, z, radius) {
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
export function rayCollider(T, ray, box, target) {
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
export function orientedBox(T, broad, frame) {
  broad.oriented = frame;
  broad.containsPoint = function (p) {
    return p.y >= this.min.y && p.y <= this.max.y && colliderContainsXZ(this, p.x, p.z);
  };
  broad.clone = function () {
    return orientedBox(T, new T.Box3().copy(this), {
      ...this.oriented,
      bounds: this.oriented.bounds.clone(),
    });
  };
  broad.expandByScalar = function (radius) {
    T.Box3.prototype.expandByScalar.call(this, radius);
    this.oriented.bounds.expandByScalar(radius);
    return this;
  };
  return broad;
}

function rectangleCorners(x, z, rx, rz, c, s) {
  return [
    [-rx, -rz],
    [-rx, rz],
    [rx, rz],
    [rx, -rz],
  ].map(([dx, dz]) => [x + c * dx + s * dz, z - s * dx + c * dz]);
}
export function footprintInsideCollider(box, point, rx, rz, angle) {
  return rectangleCorners(point.x, point.z, rx, rz, Math.cos(angle), Math.sin(angle)).every(
    ([x, z]) => colliderContainsXZ(box, x, z, 1e-9),
  );
}
export function footprintOverlapsCollider(box, point, rx, rz, angle) {
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
