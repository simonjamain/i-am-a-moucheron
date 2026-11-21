// Collision of the office pack props on the real triangles of their models, in a
// Rapier world of the decor (one trimesh collider per placed prop). Rapier keeps
// its own acceleration structure; this module turns props into colliders and
// answers ray and nearest-point queries in game metres. A few models are
// approximated on purpose (paper stacks, crumpled paper) and flat wall items
// never block. Physics only runs on the client. See docs/collisions.md.
import type { Collider as RapierCollider, World } from '@dimforge/rapier3d-compat';
import { modelBoxes, ROD, type OfficeModel, type Prop } from './office-props.ts';
import { toPhysics, toWorld, type Rapier } from './physics-world.ts';
import type { FootprintQuery } from './equipment.ts';

// Placement support on the decor (metres): rays start SUPPORT_RISE above the
// aimed height and reach SUPPORT_DROP below it; the five contacts must be flat
// (normal y above SUPPORT_FLAT) and level within SUPPORT_LEVEL; the headroom
// test starts HEADROOM_GAP above the surface.
const SUPPORT_RISE = 0.01;
const SUPPORT_DROP = 0.02;
const SUPPORT_FLAT = 0.95;
const SUPPORT_LEVEL = 0.002;
const HEADROOM_GAP = 0.001;

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

const triangles = new WeakMap<PackData, Map<OfficeModel, Float32Array>>();
/** Collision triangles of a model in its own frame, metres, 9 floats each (cached). */
export function modelTriangles(data: PackData, model: OfficeModel): Float32Array {
  let cache = triangles.get(data);
  if (!cache) triangles.set(data, (cache = new Map()));
  const known = cache.get(model);
  if (known) return known;
  const out: number[] = [];
  const shape = collisionShape(model);
  if (shape === 'proxy') for (const b of modelBoxes(model)) out.push(...boxTriangles(b));
  else if (shape === 'mesh') {
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
  const result = new Float32Array(out);
  cache.set(model, result);
  return result;
}

/** A placed prop in the decor world: its model, yaw frame and Rapier collider. */
export interface DecorSolid {
  model: OfficeModel;
  /** Origin of the prop and its yaw (c = cos, s = sin), Three.js convention. */
  frame: { x: number; y: number; z: number; c: number; s: number };
  collider: RapierCollider;
}
/** Ray hit, in game metres: distance along the unit direction, point, normal. */
export interface DecorHit {
  distance: number;
  point: [number, number, number];
  normal: [number, number, number];
  solid: DecorSolid;
}
/** Closest point of the decor to a query point, in game metres. */
export interface DecorNearest {
  distance: number;
  point: [number, number, number];
  solid: DecorSolid;
}

/**
 * The decor of one layout as a Rapier world (physics units, see physics-world.ts):
 * one fixed trimesh collider per colliding prop. Queries take and return game
 * metres. Built once per layout; `dispose` frees the world.
 */
export class DecorCollision {
  R: Rapier;
  world: World;
  solids: DecorSolid[] = [];
  byHandle = new Map<number, DecorSolid>();
  triangleCount = 0;

  constructor(R: Rapier, data: PackData, props: readonly Prop[]) {
    this.R = R;
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    const shapes = new Map<OfficeModel, { vertices: Float32Array; indices: Uint32Array }>();
    for (const p of props) {
      if (p.ghost || collisionShape(p.model) === 'none') continue;
      let shape = shapes.get(p.model);
      if (!shape) {
        const t = modelTriangles(data, p.model);
        const vertices = new Float32Array(t.length);
        for (let i = 0; i < t.length; i++) vertices[i] = toPhysics(t[i]);
        const indices = new Uint32Array(t.length / 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        shapes.set(p.model, (shape = { vertices, indices }));
      }
      if (!shape.indices.length) continue;
      const desc = R.ColliderDesc.trimesh(shape.vertices, shape.indices)
        .setTranslation(toPhysics(p.x), toPhysics(p.y), toPhysics(p.z))
        .setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) })
        .setFriction(0.4);
      const collider = this.world.createCollider(desc);
      const solid: DecorSolid = {
        model: p.model,
        frame: { x: p.x, y: p.y, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw) },
        collider,
      };
      this.solids.push(solid);
      this.byHandle.set(collider.handle, solid);
      this.triangleCount += shape.indices.length / 3;
    }
    // Fills the broad phase, so queries see every collider (nothing moves).
    this.world.step();
  }

  /**
   * Closest hit of a ray (game metres, unit direction) within `far`, on the whole
   * decor or on one solid only; null when nothing is hit.
   */
  raycast(
    origin: readonly number[],
    direction: readonly number[],
    far = 1e3,
    only?: DecorSolid,
  ): DecorHit | null {
    const R = this.R;
    const ray = new R.Ray(
      { x: toPhysics(origin[0]), y: toPhysics(origin[1]), z: toPhysics(origin[2]) },
      { x: direction[0], y: direction[1], z: direction[2] },
    );
    const hit = only
      ? only.collider.castRayAndGetNormal(ray, toPhysics(far), false)
      : this.world.castRayAndGetNormal(ray, toPhysics(far), false);
    if (!hit) return null;
    const solid = only ?? this.byHandle.get((hit as { collider: RapierCollider }).collider.handle);
    if (!solid) return null;
    const distance = toWorld(hit.timeOfImpact);
    let normal: [number, number, number] = [hit.normal.x, hit.normal.y, hit.normal.z];
    // Facing the ray: the side that was hit.
    if (normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2] > 0)
      normal = [-normal[0], -normal[1], -normal[2]];
    return {
      distance,
      point: [0, 1, 2].map((k) => origin[k] + direction[k] * distance) as [number, number, number],
      normal,
      solid,
    };
  }

  /** Closest point of the decor's surfaces within `radius` of a point, or null. */
  nearest(point: readonly number[], radius = Infinity): DecorNearest | null {
    const projection = this.world.projectPoint(
      { x: toPhysics(point[0]), y: toPhysics(point[1]), z: toPhysics(point[2]) },
      false,
    );
    if (!projection) return null;
    const solid = this.byHandle.get(projection.collider.handle);
    if (!solid) return null;
    const p: [number, number, number] = [
      toWorld(projection.point.x),
      toWorld(projection.point.y),
      toWorld(projection.point.z),
    ];
    const distance = Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]);
    return distance <= radius ? { distance, point: p, solid } : null;
  }

  /**
   * Placement support (equipment.ts DecorSupport): height of a flat, upward decor
   * surface under the centre and the four corners of the footprint, just below
   * q.y (within SUPPORT_DROP); null when the footprint overhangs or tilts.
   */
  surface(q: FootprintQuery): number | null {
    const c = Math.cos(q.angle),
      s = Math.sin(q.angle);
    const from = q.y + SUPPORT_RISE;
    const ys: number[] = [];
    for (const [u, v] of [
      [0, 0],
      [-q.rx, -q.rz],
      [-q.rx, q.rz],
      [q.rx, q.rz],
      [q.rx, -q.rz],
    ]) {
      const x = q.x + c * u + s * v,
        z = q.z - s * u + c * v;
      const hit = this.raycast([x, from, z], [0, -1, 0], SUPPORT_RISE + SUPPORT_DROP);
      if (!hit || hit.normal[1] < SUPPORT_FLAT) return null;
      ys.push(hit.point[1]);
    }
    return Math.max(...ys) - Math.min(...ys) <= SUPPORT_LEVEL ? Math.max(...ys) : null;
  }

  /** True when no decor triangle lies in the footprint's headroom above `y`. */
  clear(q: FootprintQuery, y: number): boolean {
    const R = this.R;
    const half = q.height / 2;
    const shape = new R.Cuboid(
      toPhysics(q.rx),
      toPhysics(half - HEADROOM_GAP / 2),
      toPhysics(q.rz),
    );
    let blocked = false;
    this.world.intersectionsWithShape(
      { x: toPhysics(q.x), y: toPhysics(y + HEADROOM_GAP + half), z: toPhysics(q.z) },
      { x: 0, y: Math.sin(q.angle / 2), z: 0, w: Math.cos(q.angle / 2) },
      shape,
      () => {
        blocked = true;
        return false;
      },
    );
    return !blocked;
  }

  dispose(): void {
    this.world.free();
    this.solids = [];
    this.byHandle.clear();
  }
}

/** World positions of every collision triangle of a solid (9 floats each), for drawing. */
export function solidTriangles(data: PackData, solid: DecorSolid): Float32Array {
  const f = solid.frame,
    t = modelTriangles(data, solid.model),
    out = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) {
    out[i] = f.x + f.c * t[i] + f.s * t[i + 2];
    out[i + 1] = f.y + t[i + 1];
    out[i + 2] = f.z - f.s * t[i] + f.c * t[i + 2];
  }
  return out;
}
