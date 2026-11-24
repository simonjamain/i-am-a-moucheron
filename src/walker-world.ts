import type {
  Collider as RapierCollider,
  KinematicCharacterController,
} from '@dimforge/rapier3d-compat';
import { PhysicsWorld, toPhysics, toWorld, type Rapier, type Solid } from './physics-world.ts';
import type { XYZ } from './types.ts';

/** The decor world (office-collision.ts) as Rapier's world wants it. */
type Decor = Parameters<PhysicsWorld['useDecor']>[0];

/** What a walker is for the engine: a capsule standing on `from`, in game metres. */
export interface WalkerShape {
  radius: number;
  height: number;
  /** Rest height of the walker's reference point above the surface it stands on. */
  hover: number;
  /** Highest step the walker climbs without jumping. */
  step: number;
}

export interface WalkerMove {
  x: number;
  y: number;
  z: number;
  /** True when the walker ends standing on a surface. */
  grounded: boolean;
}

// Half-width of the floor, in physics metres: the room is about 500 m wide here.
const FLOOR_HALF = 500;
const SKIN = 0.1; // share of `hover` kept as the controller's contact offset

/**
 * Where people walk: the room's solids in a Rapier world (the floor, the boxes of the shell
 * and constructions, the props' triangles) and Rapier's kinematic character controller to
 * move a capsule through it (sliding along walls, climbing steps, staying on the ground).
 * Gravity, jumps and parachutes stay the game's rules (field-physics.ts); this only answers
 * "where does the walker end up".
 */
export class WalkerWorld {
  private physics: PhysicsWorld;
  private R: Rapier;
  private controller: KinematicCharacterController | null = null;
  private collider: RapierCollider | null = null;
  private key = '';
  private lastDecor: Decor | undefined;
  private ray: InstanceType<Rapier['Ray']>;

  constructor(R: Rapier) {
    this.R = R;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.physics = new PhysicsWorld(R, { gravity: 0, floorHalf: FLOOR_HALF });
    // Fills the broad phase with the floor, so queries see it from the first step.
    this.physics.world.step();
  }

  /** Brings the world in line with the game's solids and decor; cheap when nothing moved. */
  sync(colliders: readonly Solid[], decor?: Decor): void {
    let changed = false;
    if (decor !== this.lastDecor) {
      this.physics.useDecor(decor ?? null);
      this.lastDecor = decor;
      changed = true;
    }
    if (this.physics.sync(colliders)) changed = true;
    // Queries only see colliders once the broad phase has been refreshed by a step.
    if (changed) {
      this.physics.world.timestep = 1 / 60;
      this.physics.world.step();
    }
  }

  private ensure(shape: WalkerShape): RapierCollider {
    const key = [shape.radius, shape.height, shape.hover, shape.step].join(',');
    if (this.collider && key === this.key) return this.collider;
    const R = this.R,
      world = this.physics.world;
    if (this.collider) world.removeCollider(this.collider, false);
    if (this.controller) world.removeCharacterController(this.controller);
    const skin = shape.hover * SKIN,
      radius = toPhysics(shape.radius),
      half = Math.max(0.001, toPhysics(shape.height) / 2 - radius);
    this.collider = world.createCollider(R.ColliderDesc.capsule(half, radius));
    this.controller = world.createCharacterController(toPhysics(skin));
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(toPhysics(shape.step), radius * 0.3, false);
    this.controller.setMaxSlopeClimbAngle((60 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((70 * Math.PI) / 180);
    this.key = key;
    return this.collider;
  }

  /**
   * The reference height of a walker placed at `from`: lifted onto the surface just below
   * it (within a step) when it was put at floor level, as a newly spawned or teleported
   * body is. Unchanged where there is no surface close below.
   */
  settle(from: XYZ, shape: WalkerShape): number {
    const ray = this.ray;
    ray.origin.x = toPhysics(from.x);
    ray.origin.y = toPhysics(from.y + shape.step);
    ray.origin.z = toPhysics(from.z);
    const hit = this.physics.world.castRay(ray, toPhysics(shape.step * 2), false);
    if (!hit) return from.y;
    const surface = from.y + shape.step - toWorld(hit.timeOfImpact);
    return Math.max(from.y, surface + shape.hover);
  }

  /** Moves the walker standing at `from` by `delta` through the solids. */
  move(from: XYZ, delta: XYZ, shape: WalkerShape, snap = true): WalkerMove {
    const collider = this.ensure(shape),
      controller = this.controller!,
      skin = shape.hover * SKIN,
      // The capsule's feet rest `skin` above the surface when the reference point is `hover` up.
      feet = from.y - (shape.hover - skin);
    collider.setTranslation({
      x: toPhysics(from.x),
      y: toPhysics(feet + shape.height / 2),
      z: toPhysics(from.z),
    });
    // Walking keeps its feet on the ground down a step; falling lands where it touches.
    if (snap) controller.enableSnapToGround(toPhysics(shape.step));
    else controller.disableSnapToGround();
    controller.computeColliderMovement(collider, {
      x: toPhysics(delta.x),
      y: toPhysics(delta.y),
      z: toPhysics(delta.z),
    });
    const m = controller.computedMovement(),
      dy = toWorld(m.y);
    // Falling, the ground is under the feet only when it stopped the descent: the controller's own
    // flag already holds a step above it.
    const blocked = delta.y < 0 && dy - delta.y > shape.hover * 0.01;
    return {
      x: from.x + toWorld(m.x),
      y: from.y + dy,
      z: from.z + toWorld(m.z),
      grounded: snap ? controller.computedGrounded() : blocked,
    };
  }

  dispose(): void {
    this.physics.dispose();
    this.collider = null;
    this.controller = null;
  }
}
