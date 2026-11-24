import type { Collider as RapierCollider } from '@dimforge/rapier3d-compat';
import { PhysicsWorld, toPhysics, toWorld, type Rapier, type Solid } from './physics-world.ts';

/** Nearest solid met by a ray: distance in game metres and the unit surface normal facing the ray. */
export interface SolidHit {
  distance: number;
  normal: [number, number, number];
}

/**
 * Ray queries against the game's box solids (shell, floor, constructions, vehicles' vacant
 * hulls, purgatory) in a Rapier world, so bullets, camera clearance and line-of-sight tests
 * use the engine's own acceleration structure instead of testing every box. The pack props
 * are not here: their triangles live in the decor world (office-collision.ts), and
 * `skip` leaves their boxes out once that world exists.
 */
export class SolidQuery {
  private physics: PhysicsWorld;
  private R: Rapier;
  private boxes: Solid[] = [];
  private ray: InstanceType<Rapier['Ray']>;

  constructor(R: Rapier) {
    this.R = R;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.physics = new PhysicsWorld(R, { gravity: 0 });
  }

  /** Brings the world in line with the game's list of solids; cheap when nothing moved. */
  sync(colliders: readonly Solid[], skip?: (box: Solid) => boolean): void {
    const boxes = this.boxes;
    boxes.length = 0;
    for (const box of colliders) if (!skip?.(box)) boxes.push(box);
    // Queries only see colliders once the broad phase has been refreshed by a step.
    if (this.physics.sync(boxes)) {
      this.physics.world.timestep = 1 / 60;
      this.physics.world.step();
    }
  }

  /** Nearest hit of a ray (unit direction) within `far`, or null. A ray starting inside exits the solid. */
  hit(origin: readonly number[], direction: readonly number[], far: number): SolidHit | null {
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

  /** Distance to the nearest solid within `far`, or Infinity. */
  distance(origin: readonly number[], direction: readonly number[], far: number): number {
    return this.hit(origin, direction, far)?.distance ?? Infinity;
  }

  dispose(): void {
    this.physics.dispose();
  }
}
