import type { Collider as RapierCollider } from '@dimforge/rapier3d-compat';
import { PhysicsWorld, toPhysics, toWorld, type Rapier, type Solid } from './physics-world.ts';
import type { DecorCollision } from './office-collision.ts';

/** Nearest solid met by a ray: distance in game metres and the unit surface normal facing the ray. */
export interface SolidHit {
  distance: number;
  normal: [number, number, number];
}

/** What the code that only reads the solids needs from a SolidQuery. */
export type SolidProbe = Pick<SolidQuery, 'hit' | 'segment' | 'nearest' | 'surfaceBelow'>;

/**
 * Ray queries against the game's box solids (shell, floor, constructions, vehicles' vacant
 * hulls, purgatory) in a Rapier world, so bullets, camera clearance and line-of-sight tests
 * use the engine's own acceleration structure instead of testing every box. The pack props
 * are queried on their real triangles in the decor world (office-collision.ts) once it is
 * given to `sync`, which then leaves their boxes out.
 */
const DOWN = [0, -1, 0];

export class SolidQuery {
  private physics: PhysicsWorld;
  private R: Rapier;
  private boxes: Solid[] = [];
  private decor: Pick<DecorCollision, 'raycast' | 'nearest'> | null = null;
  private ray: InstanceType<Rapier['Ray']>;
  private point = { x: 0, y: 0, z: 0 };

  constructor(R: Rapier) {
    this.R = R;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.physics = new PhysicsWorld(R, { gravity: 0 });
  }

  /** Brings the world in line with the game's list of solids; cheap when nothing moved. */
  sync(
    colliders: readonly Solid[],
    decor?: Pick<DecorCollision, 'raycast' | 'nearest'> | null,
  ): void {
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
    const ray = this.ray;
    ray.origin.x = toPhysics(origin[0]);
    ray.origin.y = toPhysics(origin[1]);
    ray.origin.z = toPhysics(origin[2]);
    ray.dir.x = direction[0];
    ray.dir.y = direction[1];
    ray.dir.z = direction[2];
    // The physics world's own floor slab is not a box of the game: leave it out.
    const hit = this.physics.world.castRayAndGetNormal(
      ray,
      toPhysics(far),
      false,
      undefined,
      undefined,
      this.physics.floor as RapierCollider,
    );
    if (!hit) return null;
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

  dispose(): void {
    this.physics.dispose();
  }
}
