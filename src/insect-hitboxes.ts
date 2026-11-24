import type { Collider, World } from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { toPhysics, toWorld, type Rapier } from './physics-world.ts';
import type { DebugSink } from './physics-debug.ts';
import type { Three } from './types.ts';

/** Enemy id keying the insect map (numeric or string, as the server sends it). */
export type InsectId = string | number;
export type InsectEntries = Iterable<readonly [InsectId, THREE.Object3D]>;

/** Where a shot meets an insect: its id, the distance from the muzzle and the point. */
export interface InsectHit {
  id: InsectId;
  distance: number;
  point: THREE.Vector3;
}

/** Hit proxy fields read from an insect model's userData (set by the species' builder). */
export interface InsectHitData {
  /** Radii of the body ellipsoid (model units) and its centre; scaled by `hitTolerance`. */
  hitEllipsoid?: readonly number[];
  hitCentre?: readonly number[];
  /** A midge: one sphere, radius normalised by 1.2. */
  sphereRadius?: number;
  hitTolerance?: number;
}

/**
 * The shape a species is hit with: a sphere or a capsule along one model axis, in model units
 * (before the model's scale and the species' tolerance).
 */
export interface HitShape {
  radius: number;
  /** 0 for a sphere. */
  halfHeight: number;
  axis: 'x' | 'y' | 'z';
  centre: readonly [number, number, number];
}

// A body whose longest radius is under this ratio of the others is hit as a sphere.
const SPHERE_RATIO = 1.15;

/** Sphere or capsule that holds an ellipsoid: the longest radius becomes the capsule's length. */
export function capsuleOf(
  radii: readonly number[],
  centre: readonly number[] = [0, 0, 0],
): HitShape {
  const order = [0, 1, 2].sort((a, b) => radii[b] - radii[a]);
  const [long, mid, short] = order.map((i) => radii[i]);
  const c: [number, number, number] = [centre[0] ?? 0, centre[1] ?? 0, centre[2] ?? 0];
  if (long < mid * SPHERE_RATIO)
    return { radius: Math.max(long, mid, short), halfHeight: 0, axis: 'y', centre: c };
  // The capsule holds the ellipsoid: its radius is the wider of the other two radii.
  const radius = Math.max(mid, short);
  return {
    radius,
    halfHeight: Math.max(0, long - radius),
    axis: 'xyz'[order[0]] as 'x',
    centre: c,
  };
}

/** The hit shape declared by a model's userData, or null (see `fitShape`). */
export function declaredShape(model: THREE.Object3D): HitShape | null {
  const u: InsectHitData = model.userData;
  if (u.hitEllipsoid) return capsuleOf(u.hitEllipsoid, u.hitCentre);
  if (u.sphereRadius)
    return { radius: u.sphereRadius / 1.2, halfHeight: 0, axis: 'y', centre: [0, 0, 0] };
  return null;
}

/** For a model with no declared proxy: the capsule of its drawn parts, measured once. */
function fitShape(T: Three, model: THREE.Object3D): HitShape {
  const q = model.quaternion.clone();
  model.quaternion.identity();
  model.updateWorldMatrix(true, true);
  const box = new T.Box3().setFromObject(model);
  model.quaternion.copy(q);
  model.updateWorldMatrix(true, true);
  const scale = model.getWorldScale(new T.Vector3());
  const centre = box.getCenter(new T.Vector3()).sub(model.getWorldPosition(new T.Vector3()));
  const half = box.getSize(new T.Vector3()).multiplyScalar(0.5);
  const s = [Math.abs(scale.x) || 1, Math.abs(scale.y) || 1, Math.abs(scale.z) || 1];
  return capsuleOf(
    [half.x / s[0], half.y / s[1], half.z / s[2]],
    [centre.x / s[0], centre.y / s[1], centre.z / s[2]],
  );
}

interface Hitbox {
  model: THREE.Object3D;
  shape: HitShape;
  collider: Collider;
  /** The size the collider was last given (physics metres). */
  size: number;
  enabled: boolean;
}

/**
 * Hit volumes of the living insects in a Rapier world: a sphere for a midge, a capsule for the
 * other species, moved to their models every frame. Only shots look at them (no collision, no
 * insect against insect). The colliders belong to no body: moving one costs about 0.5 µs of
 * engine time, 0.5 ms a frame for 900 insects.
 */
export class InsectHitboxes {
  private T: Three;
  private R: Rapier;
  private world: World;
  private boxes = new Map<InsectId, Hitbox>();
  private ids = new Map<number, InsectId>();
  private ray: InstanceType<Rapier['Ray']>;
  private position = { x: 0, y: 0, z: 0 };
  private rotation = { x: 0, y: 0, z: 0, w: 1 };
  private axes: Record<'x' | 'y' | 'z', THREE.Quaternion>;
  private q: THREE.Quaternion;
  private p: THREE.Vector3;
  private s: THREE.Vector3;
  private o: THREE.Vector3;

  constructor(T: Three, R: Rapier) {
    this.T = T;
    this.R = R;
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = 1 / 60;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    // A capsule stands along Y; these turn it onto a model axis.
    const up = new T.Vector3(0, 1, 0);
    this.axes = {
      x: new T.Quaternion().setFromUnitVectors(up, new T.Vector3(1, 0, 0)),
      y: new T.Quaternion(),
      z: new T.Quaternion().setFromUnitVectors(up, new T.Vector3(0, 0, 1)),
    };
    this.q = new T.Quaternion();
    this.p = new T.Vector3();
    this.s = new T.Vector3();
    this.o = new T.Vector3();
  }

  /** Number of hit volumes. */
  get size(): number {
    return this.boxes.size;
  }

  /**
   * Brings the volumes in line with the insects: one per model, placed on it; a hidden or
   * `excluded` (already killed) insect has none in play. Call once a frame, after they moved.
   */
  sync(insects: InsectEntries, excluded: ReadonlySet<InsectId> | null = null): void {
    const seen = new Set<InsectId>();
    for (const [id, model] of insects) {
      seen.add(id);
      let box = this.boxes.get(id);
      if (box && box.model !== model) {
        this.drop(id, box);
        box = undefined;
      }
      const live = model.visible && !excluded?.has(id);
      if (!box) {
        if (!live) continue;
        box = this.create(model);
        this.boxes.set(id, box);
        this.ids.set(box.collider.handle, id);
      }
      if (box.enabled !== live) {
        box.collider.setEnabled(live);
        box.enabled = live;
      }
      if (live) this.place(box);
    }
    for (const [id, box] of this.boxes) if (!seen.has(id)) this.drop(id, box);
    // The broad phase only sees moved colliders after a step (there are no bodies to move).
    this.world.step();
  }

  /** First insect met by a ray within `maxDistance` (direction need not be a unit vector). */
  nearest(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance = 60,
    excluded: ReadonlySet<InsectId> | null = null,
  ): InsectHit | null {
    const length = direction.length();
    if (!(length > 1e-6) || !Number.isFinite(length) || !Number.isFinite(maxDistance)) return null;
    const ray = this.ray;
    ray.origin.x = toPhysics(origin.x);
    ray.origin.y = toPhysics(origin.y);
    ray.origin.z = toPhysics(origin.z);
    ray.dir.x = direction.x / length;
    ray.dir.y = direction.y / length;
    ray.dir.z = direction.z / length;
    const hit = this.world.castRay(
      ray,
      toPhysics(maxDistance),
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      excluded ? (c) => !excluded.has(this.ids.get(c.handle) as InsectId) : undefined,
    );
    if (!hit) return null;
    const id = this.ids.get(hit.collider.handle);
    if (id === undefined) return null;
    const distance = toWorld(hit.timeOfImpact);
    return {
      id,
      distance,
      point: this.o
        .set(ray.dir.x, ray.dir.y, ray.dir.z)
        .multiplyScalar(distance)
        .add(origin)
        .clone(),
    };
  }

  /** The first insect whose volume lies within `padding` of a point (an aircraft's nose), or null. */
  contact(point: THREE.Vector3, padding = 0): InsectId | null {
    const found = this.world.intersectionWithShape(
      { x: toPhysics(point.x), y: toPhysics(point.y), z: toPhysics(point.z) },
      { x: 0, y: 0, z: 0, w: 1 },
      new this.R.Ball(Math.max(1e-6, toPhysics(padding))),
    );
    return found ? (this.ids.get(found.handle) ?? null) : null;
  }

  /** Every insect whose volume lies within `radius` of a point, with its distance to the surface. */
  within(point: THREE.Vector3, radius: number): { id: InsectId; distance: number }[] {
    const found: { id: InsectId; distance: number }[] = [];
    const at = { x: toPhysics(point.x), y: toPhysics(point.y), z: toPhysics(point.z) };
    this.world.intersectionsWithShape(
      at,
      { x: 0, y: 0, z: 0, w: 1 },
      new this.R.Ball(Math.max(1e-6, toPhysics(radius))),
      (collider) => {
        const id = this.ids.get(collider.handle);
        const projection = collider.projectPoint(at, true);
        if (id !== undefined && projection)
          found.push({
            id,
            distance: projection.isInside
              ? 0
              : toWorld(
                  Math.hypot(
                    projection.point.x - at.x,
                    projection.point.y - at.y,
                    projection.point.z - at.z,
                  ),
                ),
          });
        return true;
      },
    );
    return found;
  }

  /** The volumes' edges, for the "Volumes" view (physics metres, see physics-debug.ts). */
  debugDraw(sink: DebugSink): void {
    const v = this.world.debugRender().vertices;
    for (let i = 0; i + 5 < v.length; i += 6)
      sink([v[i], v[i + 1], v[i + 2]], [v[i + 3], v[i + 4], v[i + 5]], 0xff5ad2);
  }

  dispose(): void {
    this.boxes.clear();
    this.ids.clear();
    this.world.free();
  }

  private create(model: THREE.Object3D): Hitbox {
    const shape = declaredShape(model) ?? fitShape(this.T, model);
    const desc =
      shape.halfHeight > 0
        ? this.R.ColliderDesc.capsule(1e-3, 1e-3)
        : this.R.ColliderDesc.ball(1e-3);
    const collider = this.world.createCollider(desc);
    return { model, shape, collider, size: 0, enabled: true };
  }

  private drop(id: InsectId, box: Hitbox): void {
    this.world.removeCollider(box.collider, false);
    this.ids.delete(box.collider.handle);
    this.boxes.delete(id);
  }

  private place(box: Hitbox): void {
    const { model, shape, collider } = box;
    const direct = !model.parent || (model.parent as THREE.Scene).isScene;
    if (direct) {
      this.p.copy(model.position);
      this.q.copy(model.quaternion);
      this.s.copy(model.scale);
    } else {
      model.updateWorldMatrix(true, false);
      model.matrixWorld.decompose(this.p, this.q, this.s);
    }
    const scale = Math.max(Math.abs(this.s.x), Math.abs(this.s.y), Math.abs(this.s.z));
    const tolerance = (model.userData as InsectHitData).hitTolerance || 1;
    const k = scale * tolerance;
    // Size, only when the model or its tolerance changed.
    const radius = toPhysics(shape.radius * k);
    if (radius !== box.size) {
      box.size = radius;
      collider.setRadius?.(radius);
      if (shape.halfHeight > 0) collider.setHalfHeight(toPhysics(shape.halfHeight * k));
    }
    // The shape's centre is in model units, turned by the model; the capsule then turns onto its axis.
    this.o.set(shape.centre[0], shape.centre[1], shape.centre[2]).multiplyScalar(scale);
    this.o.applyQuaternion(this.q).add(this.p);
    const position = this.position;
    position.x = toPhysics(this.o.x);
    position.y = toPhysics(this.o.y);
    position.z = toPhysics(this.o.z);
    collider.setTranslation(position);
    if (shape.halfHeight > 0) {
      this.q.multiply(this.axes[shape.axis]);
      const r = this.rotation;
      r.x = this.q.x;
      r.y = this.q.y;
      r.z = this.q.z;
      r.w = this.q.w;
      collider.setRotation(r);
    }
  }
}
