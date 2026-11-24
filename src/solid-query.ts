import type { Collider as RapierCollider } from '@dimforge/rapier3d-compat';
import { PhysicsWorld, toPhysics, toWorld, type Rapier, type Solid } from './physics-world.ts';
import type { DecorCollision } from './office-collision.ts';
import type { FootprintQuery } from './equipment.ts';

/** Nearest solid met by a ray: distance in game metres and the unit surface normal facing the ray. */
export interface SolidHit {
  distance: number;
  normal: [number, number, number];
}

/** What the code that only reads the solids needs from a SolidQuery. */
export type SolidProbe = Pick<SolidQuery, 'hit' | 'segment' | 'nearest' | 'surfaceBelow'>;

/** The props' collision world as a SolidQuery sees it. */
export type DecorProbe = Pick<DecorCollision, 'raycast' | 'nearest'> &
  Partial<Pick<DecorCollision, 'surface' | 'clear'>>;

/**
 * Ray queries against the game's box solids (shell, floor, constructions, vehicles' vacant
 * hulls, purgatory) in a Rapier world, so bullets, camera clearance and line-of-sight tests
 * use the engine's own acceleration structure instead of testing every box. The pack props
 * are queried on their real triangles in the decor world (office-collision.ts) once it is
 * given to `sync`, which then leaves their boxes out.
 */
const DOWN = [0, -1, 0];
// Placement support (game metres, as in office-collision.ts): corner rays start SUPPORT_RISE above
// the centre's top and must come back within SUPPORT_LEVEL; headroom starts HEADROOM_GAP above.
const SUPPORT_RISE = 0.01;
const SUPPORT_LEVEL = 0.002;
const SUPPORT_FLAT = 0.95;
const HEADROOM_GAP = 0.001;

export class SolidQuery {
  private physics: PhysicsWorld;
  private R: Rapier;
  private boxes: Solid[] = [];
  private decor: DecorProbe | null = null;
  private ray: InstanceType<Rapier['Ray']>;
  private point = { x: 0, y: 0, z: 0 };

  constructor(R: Rapier) {
    this.R = R;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.physics = new PhysicsWorld(R, { gravity: 0 });
  }

  /** Brings the world in line with the game's list of solids; cheap when nothing moved. */
  sync(colliders: readonly Solid[], decor?: DecorProbe | null): void {
    const boxes = this.boxes;
    boxes.length = 0;
    this.decor = decor ?? null;
    for (const box of colliders)
      if (!(decor && (box as { decor?: boolean }).decor)) boxes.push(box);
    // Queries only see colliders once the broad phase has been refreshed by a step.
    if (this.physics.sync(boxes)) {
      this.physics.world.timestep = 1 / 60;
      this.physics.world.step();
    }
  }

  /** Nearest hit of a ray (unit direction) within `far`, or null. A ray starting inside exits the solid. */
  hit(origin: readonly number[], direction: readonly number[], far: number): SolidHit | null {
    const box = this.boxHit(origin, direction, far);
    const decor = this.decor;
    if (!decor || (box && box.distance <= 0)) return box;
    const prop = decor.raycast(origin, direction, box ? Math.min(far, box.distance) : far);
    return prop && (!box || prop.distance < box.distance)
      ? { distance: prop.distance, normal: prop.normal as [number, number, number] }
      : box;
  }

  private boxHit(
    origin: readonly number[],
    direction: readonly number[],
    far: number,
  ): SolidHit | null {
    return this.cast(origin, direction, far, false, true);
  }

  /** A ray in the box world; `solid`: a ray starting inside a box hits at 0; `skip`: colliders to ignore. */
  private cast(
    origin: readonly number[],
    direction: readonly number[],
    far: number,
    solid: boolean,
    withoutFloor: boolean,
    skip?: Set<number>,
    found?: { handle: number },
  ): SolidHit | null {
    const ray = this.ray;
    ray.origin.x = toPhysics(origin[0]);
    ray.origin.y = toPhysics(origin[1]);
    ray.origin.z = toPhysics(origin[2]);
    ray.dir.x = direction[0];
    ray.dir.y = direction[1];
    ray.dir.z = direction[2];
    const floor = this.physics.floor as RapierCollider;
    // The physics world's own floor slab is not a box of the game unless asked for.
    const hit = this.physics.world.castRayAndGetNormal(
      ray,
      toPhysics(far),
      solid,
      undefined,
      undefined,
      withoutFloor ? floor : undefined,
      undefined,
      skip ? (collider) => !skip.has(collider.handle) : undefined,
    );
    if (!hit) return null;
    if (found) found.handle = hit.collider.handle;
    let normal: [number, number, number] = [hit.normal.x, hit.normal.y, hit.normal.z];
    if (normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2] > 0)
      normal = [-normal[0], -normal[1], -normal[2]];
    return { distance: toWorld(hit.timeOfImpact), normal };
  }

  /** First contact of the segment a→b: its fraction in [0, 1] and the surface normal facing it, or null. */
  segment(
    a: readonly number[],
    b: readonly number[],
  ): { t: number; normal: [number, number, number] } | null {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-12) return null;
    const hit = this.hit(a, [dx / length, dy / length, dz / length], length);
    return hit ? { t: hit.distance / length, normal: hit.normal } : null;
  }

  /**
   * Height of the first surface met going down from (x, `from`, z), within `reach` below, or
   * `fallback` when there is none: the top of whatever stands under that point.
   */
  surfaceBelow(x: number, from: number, z: number, reach: number, fallback = 0): number {
    const hit = this.hit([x, from, z], DOWN, reach);
    return hit ? from - hit.distance : fallback;
  }

  /** Distance from a point to the nearest solid, or null beyond `radius` (proximity fuses). */
  nearest(point: readonly number[], radius: number): number | null {
    const prop = this.decor?.nearest(point, radius)?.distance ?? null;
    const box = this.boxNearest(point, radius);
    return prop === null ? box : box === null ? prop : Math.min(prop, box);
  }

  private boxNearest(point: readonly number[], radius: number): number | null {
    const p = this.point;
    p.x = toPhysics(point[0]);
    p.y = toPhysics(point[1]);
    p.z = toPhysics(point[2]);
    const found = this.physics.world.projectPoint(
      p,
      true,
      undefined,
      undefined,
      this.physics.floor as RapierCollider,
    );
    if (!found) return null;
    const distance = found.isInside
      ? 0
      : toWorld(Math.hypot(found.point.x - p.x, found.point.y - p.y, found.point.z - p.z));
    return distance <= radius ? distance : null;
  }

  /** Distance to the nearest solid within `far`, or Infinity. */
  distance(origin: readonly number[], direction: readonly number[], far: number): number {
    return this.hit(origin, direction, far)?.distance ?? Infinity;
  }

  /**
   * Flat tops that carry a whole footprint (centre and four corners level and facing up),
   * highest first, from `up` above to `down` below the aimed height: the floor, furniture,
   * constructions, and the props' triangles. A furniture top under another is a further one.
   */
  supports(q: FootprintQuery, up: number, down: number): number[] {
    const ys: number[] = [];
    const c = Math.cos(q.angle),
      s = Math.sin(q.angle);
    const at = (u: number, v: number): [number, number] => [
      q.x + c * u + s * v,
      q.z - s * u + c * v,
    ];
    const corners = [at(-q.rx, -q.rz), at(-q.rx, q.rz), at(q.rx, q.rz), at(q.rx, -q.rz)];
    const from = q.y + up,
      skip = new Set<number>(),
      found = { handle: 0 };
    for (let i = 0; i < 8; i++) {
      const centre = this.cast([q.x, from, q.z], DOWN, up + down, true, true, skip, found);
      if (!centre) break;
      skip.add(found.handle);
      const top = from - centre.distance;
      if (centre.normal[1] < SUPPORT_FLAT) continue;
      const level = corners.every(([x, z]) => {
        const hit = this.cast(
          [x, top + SUPPORT_RISE, z],
          DOWN,
          SUPPORT_RISE + SUPPORT_LEVEL,
          false,
          true,
        );
        return (
          hit &&
          hit.normal[1] >= SUPPORT_FLAT &&
          Math.abs(SUPPORT_RISE - hit.distance) <= SUPPORT_LEVEL
        );
      });
      if (level) ys.push(top);
    }
    const prop = this.decor?.surface?.(q);
    if (prop != null && prop <= q.y + up && prop >= q.y - down) ys.push(prop);
    return ys.sort((a, b) => b - a);
  }

  /** True when nothing (box or prop triangle) stands in the footprint's headroom above `y`. */
  clear(q: FootprintQuery, y: number): boolean {
    const gap = HEADROOM_GAP,
      half = (q.height - gap) / 2;
    const shape = new this.R.Cuboid(toPhysics(q.rx), toPhysics(half), toPhysics(q.rz));
    const blocked = this.physics.world.intersectionWithShape(
      { x: toPhysics(q.x), y: toPhysics(y + gap + half), z: toPhysics(q.z) },
      { x: 0, y: Math.sin(q.angle / 2), z: 0, w: Math.cos(q.angle / 2) },
      shape,
      undefined,
      undefined,
      this.physics.floor as RapierCollider,
    );
    return !blocked && (this.decor?.clear?.(q, y) ?? true);
  }

  dispose(): void {
    this.physics.dispose();
  }
}
