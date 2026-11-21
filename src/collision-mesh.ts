// Triangle collision meshes: a bounding volume hierarchy (BVH) over a model's own
// triangles, built once per model in its own frame, then queried by every placed
// copy through a yaw frame (see office-collision.ts). Pure data and arithmetic: no
// Three.js, so the server and the workers can share it. See docs/collisions.md.

/** Closest ray hit: distance along the (unit) direction, triangle normal, index. */
export interface MeshHit {
  distance: number;
  normal: [number, number, number];
  triangle: number;
}
/** Closest point of the mesh to a query point, its distance and the triangle normal. */
export interface MeshNearest {
  distance: number;
  point: [number, number, number];
  normal: [number, number, number];
  triangle: number;
}

const LEAF = 4;
const EPSILON = 1e-12;

/**
 * Triangles (9 floats each, metres) and their BVH. `nodes` holds, per node, its
 * bounds (6 floats); `links` holds per node [first, count] for a leaf (count > 0)
 * or [right child, 0] for an inner node, whose left child follows it.
 */
export class TriangleMesh {
  readonly triangles: Float32Array;
  readonly count: number;
  readonly nodes: Float32Array;
  readonly links: Int32Array;
  readonly min: [number, number, number];
  readonly max: [number, number, number];

  constructor(positions: Float32Array) {
    if (positions.length % 9) throw Error('triangle mesh: 9 floats per triangle');
    const count = positions.length / 9;
    this.count = count;
    const order = new Int32Array(count),
      centre = new Float32Array(count * 3),
      box = new Float32Array(count * 6);
    for (let t = 0; t < count; t++) {
      order[t] = t;
      for (let k = 0; k < 3; k++) {
        const a = positions[t * 9 + k],
          b = positions[t * 9 + 3 + k],
          c = positions[t * 9 + 6 + k];
        box[t * 6 + k] = Math.min(a, b, c);
        box[t * 6 + 3 + k] = Math.max(a, b, c);
        centre[t * 3 + k] = (a + b + c) / 3;
      }
    }
    const nodes: number[] = [],
      links: number[] = [];
    const build = (first: number, n: number): number => {
      const id = links.length / 2;
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity],
        clo = [Infinity, Infinity, Infinity],
        chi = [-Infinity, -Infinity, -Infinity];
      for (let i = first; i < first + n; i++) {
        const t = order[i];
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], box[t * 6 + k]);
          hi[k] = Math.max(hi[k], box[t * 6 + 3 + k]);
          clo[k] = Math.min(clo[k], centre[t * 3 + k]);
          chi[k] = Math.max(chi[k], centre[t * 3 + k]);
        }
      }
      nodes.push(...lo, ...hi);
      links.push(first, n);
      if (n <= LEAF) return id;
      // Split at the middle of the widest centre spread; fall back to halves.
      let axis = 0;
      for (let k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
      const middle = (clo[axis] + chi[axis]) / 2;
      let i = first,
        j = first + n - 1;
      while (i <= j) {
        if (centre[order[i] * 3 + axis] < middle) i++;
        else {
          const swap = order[i];
          order[i] = order[j];
          order[j] = swap;
          j--;
        }
      }
      let left = i - first;
      if (left === 0 || left === n) {
        const part = order.subarray(first, first + n);
        part.sort((a, b) => centre[a * 3 + axis] - centre[b * 3 + axis]);
        left = n >> 1;
      }
      build(first, left);
      const right = build(first + left, n - left);
      links[id * 2] = right;
      links[id * 2 + 1] = 0;
      return id;
    };
    if (count) build(0, count);
    else {
      nodes.push(0, 0, 0, 0, 0, 0);
      links.push(0, 0);
    }
    // Triangles stored in BVH order, so leaves read contiguous memory.
    this.triangles = new Float32Array(count * 9);
    for (let i = 0; i < count; i++)
      this.triangles.set(positions.subarray(order[i] * 9, order[i] * 9 + 9), i * 9);
    this.nodes = new Float32Array(nodes);
    this.links = new Int32Array(links);
    this.min = [this.nodes[0], this.nodes[1], this.nodes[2]];
    this.max = [this.nodes[3], this.nodes[4], this.nodes[5]];
  }

  /** Closest hit of the ray (origin o, unit direction d) within `far`, or null. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    far = Infinity,
  ): MeshHit | null {
    if (!this.count) return null;
    const ix = 1 / dx,
      iy = 1 / dy,
      iz = 1 / dz;
    const nodes = this.nodes,
      links = this.links,
      tri = this.triangles;
    let best = far,
      hit = -1;
    const stack = [0];
    while (stack.length) {
      const n = stack.pop()!;
      const b = n * 6;
      // Slab test against the node bounds.
      let t0 = 0,
        t1 = best;
      let a = (nodes[b] - ox) * ix,
        c = (nodes[b + 3] - ox) * ix;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
      a = (nodes[b + 1] - oy) * iy;
      c = (nodes[b + 4] - oy) * iy;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
      a = (nodes[b + 2] - oz) * iz;
      c = (nodes[b + 5] - oz) * iz;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
      if (!(t0 <= t1)) continue;
      const first = links[n * 2],
        count = links[n * 2 + 1];
      if (count === 0) {
        stack.push(first, n + 1);
        continue;
      }
      for (let i = first; i < first + count; i++) {
        // Möller–Trumbore, both faces.
        const p = i * 9;
        const e1x = tri[p + 3] - tri[p],
          e1y = tri[p + 4] - tri[p + 1],
          e1z = tri[p + 5] - tri[p + 2];
        const e2x = tri[p + 6] - tri[p],
          e2y = tri[p + 7] - tri[p + 1],
          e2z = tri[p + 8] - tri[p + 2];
        const px = dy * e2z - dz * e2y,
          py = dz * e2x - dx * e2z,
          pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < EPSILON) continue;
        const inv = 1 / det;
        const sx = ox - tri[p],
          sy = oy - tri[p + 1],
          sz = oz - tri[p + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y,
          qy = sz * e1x - sx * e1z,
          qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t >= 0 && t < best) {
          best = t;
          hit = i;
        }
      }
    }
    if (hit < 0) return null;
    const normal = this.normal(hit);
    // Facing the ray: the side that was hit.
    if (normal[0] * dx + normal[1] * dy + normal[2] * dz > 0)
      for (let k = 0; k < 3; k++) normal[k] = -normal[k];
    return { distance: best, normal, triangle: hit };
  }

  /** Closest point of the mesh within `radius` of p, or null. */
  nearest(px: number, py: number, pz: number, radius = Infinity): MeshNearest | null {
    if (!this.count) return null;
    const nodes = this.nodes,
      links = this.links;
    let best = radius * radius,
      hit = -1;
    const point: [number, number, number] = [0, 0, 0],
      scratch: [number, number, number] = [0, 0, 0];
    const stack = [0];
    while (stack.length) {
      const n = stack.pop()!;
      const b = n * 6;
      let d2 = 0;
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? px : k === 1 ? py : pz;
        const e = Math.max(nodes[b + k] - v, 0, v - nodes[b + 3 + k]);
        d2 += e * e;
      }
      if (d2 > best) continue;
      const first = links[n * 2],
        count = links[n * 2 + 1];
      if (count === 0) {
        stack.push(first, n + 1);
        continue;
      }
      for (let i = first; i < first + count; i++) {
        closestOnTriangle(this.triangles, i * 9, px, py, pz, scratch);
        const ex = scratch[0] - px,
          ey = scratch[1] - py,
          ez = scratch[2] - pz;
        const e2 = ex * ex + ey * ey + ez * ez;
        if (e2 <= best) {
          best = e2;
          hit = i;
          point[0] = scratch[0];
          point[1] = scratch[1];
          point[2] = scratch[2];
        }
      }
    }
    if (hit < 0) return null;
    return { distance: Math.sqrt(best), point, normal: this.normal(hit), triangle: hit };
  }

  /** Unit normal of triangle i (winding order of the model). */
  normal(i: number): [number, number, number] {
    const t = this.triangles,
      p = i * 9;
    const ax = t[p + 3] - t[p],
      ay = t[p + 4] - t[p + 1],
      az = t[p + 5] - t[p + 2];
    const bx = t[p + 6] - t[p],
      by = t[p + 7] - t[p + 1],
      bz = t[p + 8] - t[p + 2];
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
}

// Closest point of triangle (t[p..p+8]) to q (Ericson, Real-Time Collision Detection).
function closestOnTriangle(
  t: Float32Array,
  p: number,
  qx: number,
  qy: number,
  qz: number,
  out: [number, number, number],
): void {
  const ax = t[p],
    ay = t[p + 1],
    az = t[p + 2];
  const abx = t[p + 3] - ax,
    aby = t[p + 4] - ay,
    abz = t[p + 5] - az;
  const acx = t[p + 6] - ax,
    acy = t[p + 7] - ay,
    acz = t[p + 8] - az;
  const apx = qx - ax,
    apy = qy - ay,
    apz = qz - az;
  const d1 = abx * apx + aby * apy + abz * apz,
    d2 = acx * apx + acy * apy + acz * apz;
  const set = (u: number, v: number) => {
    out[0] = ax + abx * u + acx * v;
    out[1] = ay + aby * u + acy * v;
    out[2] = az + abz * u + acz * v;
  };
  if (d1 <= 0 && d2 <= 0) return set(0, 0);
  const bpx = qx - t[p + 3],
    bpy = qy - t[p + 4],
    bpz = qz - t[p + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz,
    d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return set(d1 / (d1 - d3), 0);
  const cpx = qx - t[p + 6],
    cpy = qy - t[p + 7],
    cpz = qz - t[p + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz,
    d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return set(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set(1 - w, w);
  }
  const denom = 1 / (va + vb + vc);
  set(vb * denom, vc * denom);
}

/** Twelve triangles of an axis-aligned box [minX, minY, minZ, maxX, maxY, maxZ]. */
export function boxTriangles(b: readonly number[]): number[] {
  const [x0, y0, z0, x1, y1, z1] = b;
  const v = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  // Outward winding (counter-clockwise seen from outside).
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
  ];
  const out: number[] = [];
  for (const [a, b2, c, d] of faces)
    out.push(...v[a], ...v[b2], ...v[c], ...v[a], ...v[c], ...v[d]);
  return out;
}
