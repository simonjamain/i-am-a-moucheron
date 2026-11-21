// Collision meshes of the office pack props: each placed prop collides with the
// real triangles of its model (collision-mesh.ts), except a few models whose
// shape is approximated on purpose (paper stacks, crumpled paper) and the flat
// wall items that never block. A mesh is built once per model, in its own frame;
// every placed copy is a MeshSolid: its world bounds (broad phase) plus a yaw
// frame that carries queries into the model frame. See docs/collisions.md.
import { TriangleMesh, boxTriangles, type MeshHit, type MeshNearest } from './collision-mesh.ts';
import { modelBoxes, ROD, type OfficeModel, type Prop } from './office-props.ts';

/** How a model collides: its triangles, boxes standing for it, or not at all. */
export type CollisionShape = 'mesh' | 'proxy' | 'none';
// Piles of sheets and paper balls: many tiny corners, approximated by their
// hitboxes (office-props.ts). Vents and the door are flush with the shell wall,
// whose own solid stops everything; a lone flat sheet lies on the floor.
const SHAPES: Partial<Record<OfficeModel, CollisionShape>> = {
  Paper_Stack: 'proxy',
  Paper_Stack_Tall: 'proxy',
  Paper_Stack_Small: 'proxy',
  Paper_Crumpled: 'proxy',
  Paper_Crumpled_Pile: 'proxy',
  Paper_Crumpled_Yellow: 'proxy',
  Paper_Crumpled_Sheet: 'none',
  Wall_Vent: 'none',
  Office_Door: 'none',
};
export const collisionShape = (model: OfficeModel): CollisionShape => SHAPES[model] ?? 'mesh';

/** Embedded model data (office-pack-data.js): int16 positions, uint16 indices. */
export interface PackData {
  parts: readonly { part: string; positions: string; indices: string }[];
}
const POSITION_STEP = 5e-4;
const bytes = (base64: string): Uint8Array => {
  const text = atob(base64),
    out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
};

/** A placed prop as a collider: world bounds, yaw frame and the model's mesh. */
export interface MeshSolid {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  model: OfficeModel;
  mesh: TriangleMesh;
  /** Origin of the prop and its yaw (c = cos, s = sin), Three.js convention. */
  frame: { x: number; y: number; z: number; c: number; s: number };
}

const meshes = new WeakMap<PackData, Map<OfficeModel, TriangleMesh>>();
/** Collision mesh of a model in its own frame (cached per data module). */
export function modelMesh(data: PackData, model: OfficeModel): TriangleMesh {
  let cache = meshes.get(data);
  if (!cache) meshes.set(data, (cache = new Map()));
  const known = cache.get(model);
  if (known) return known;
  const out: number[] = [];
  if (collisionShape(model) === 'proxy')
    for (const b of modelBoxes(model)) out.push(...boxTriangles(b));
  else if (collisionShape(model) === 'mesh') {
    const part = data.parts.find((p) => p.part === model);
    if (!part) throw Error('office pack model missing: ' + model);
    const p = bytes(part.positions),
      positions = new Int16Array(p.buffer, p.byteOffset, p.byteLength / 2);
    const i = bytes(part.indices),
      indices = new Uint16Array(i.buffer, i.byteOffset, i.byteLength / 2);
    for (const index of indices)
      for (let k = 0; k < 3; k++) out.push(positions[index * 3 + k] * POSITION_STEP);
    // Hanging models: the rod above the hanging point, up into the clouds.
    if (model === 'Ceiling_Fan') out.push(...boxTriangles([-0.008, 0, -0.008, 0.008, ROD, 0.008]));
  }
  const mesh = new TriangleMesh(new Float32Array(out));
  cache.set(model, mesh);
  return mesh;
}

/** Colliders of the props: one MeshSolid per colliding, non-ghost prop. */
export function propMeshSolids(data: PackData, props: readonly Prop[]): MeshSolid[] {
  const solids: MeshSolid[] = [];
  for (const p of props) {
    if (p.ghost || collisionShape(p.model) === 'none') continue;
    const mesh = modelMesh(data, p.model);
    if (!mesh.count) continue;
    const c = Math.cos(p.yaw),
      s = Math.sin(p.yaw);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const lx of [mesh.min[0], mesh.max[0]])
      for (const lz of [mesh.min[2], mesh.max[2]]) {
        const x = p.x + c * lx + s * lz,
          z = p.z - s * lx + c * lz;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    solids.push({
      min: { x: x0, y: p.y + mesh.min[1], z: z0 },
      max: { x: x1, y: p.y + mesh.max[1], z: z1 },
      model: p.model,
      mesh,
      frame: { x: p.x, y: p.y, z: p.z, c, s },
    });
  }
  return solids;
}

// World <-> model frame (yaw only): local = R^T (world - origin).
const toLocal = (f: MeshSolid['frame'], x: number, z: number): [number, number] => [
  f.c * x - f.s * z,
  f.s * x + f.c * z,
];
const toWorld = (f: MeshSolid['frame'], x: number, z: number): [number, number] => [
  f.c * x + f.s * z,
  -f.s * x + f.c * z,
];

/** Closest hit of a world ray (unit direction) on the solid, normal in world axes. */
export function raycastSolid(
  solid: MeshSolid,
  origin: readonly number[],
  direction: readonly number[],
  far = Infinity,
): MeshHit | null {
  const f = solid.frame;
  const [ox, oz] = toLocal(f, origin[0] - f.x, origin[2] - f.z);
  const [dx, dz] = toLocal(f, direction[0], direction[2]);
  const hit = solid.mesh.raycast(ox, origin[1] - f.y, oz, dx, direction[1], dz, far);
  if (!hit) return null;
  const [nx, nz] = toWorld(f, hit.normal[0], hit.normal[2]);
  hit.normal = [nx, hit.normal[1], nz];
  return hit;
}

/** Closest point of the solid within `radius` of a world point, in world axes. */
export function nearestOnSolid(
  solid: MeshSolid,
  point: readonly number[],
  radius = Infinity,
): MeshNearest | null {
  const f = solid.frame;
  const [px, pz] = toLocal(f, point[0] - f.x, point[2] - f.z);
  const near = solid.mesh.nearest(px, point[1] - f.y, pz, radius);
  if (!near) return null;
  const [wx, wz] = toWorld(f, near.point[0], near.point[2]);
  near.point = [wx + f.x, near.point[1] + f.y, wz + f.z];
  const [nx, nz] = toWorld(f, near.normal[0], near.normal[2]);
  near.normal = [nx, near.normal[1], nz];
  return near;
}

/** World positions of every triangle of the solid (9 floats each), for drawing. */
export function solidTriangles(solid: MeshSolid): Float32Array {
  const f = solid.frame,
    t = solid.mesh.triangles,
    out = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) {
    const [x, z] = toWorld(f, t[i], t[i + 2]);
    out[i] = x + f.x;
    out[i + 1] = t[i + 1] + f.y;
    out[i + 2] = z + f.z;
  }
  return out;
}
