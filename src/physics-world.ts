import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider as RapierCollider, World } from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { ACTOR_UNIT, MAP } from './scale.ts';
import { colliderBounds } from './oriented-collider.ts';
import type { OrientedFrame } from './oriented-collider.ts';
import type { XYZ } from './types.ts';

/** The Rapier module (the default export of `rapier.compat.mjs`). */
export type Rapier = typeof RAPIER;
/** A room solid: a Box3, optionally carrying a yaw frame (oriented-collider.ts). */
export type Solid = THREE.Box3 & { oriented?: OrientedFrame };

// Physics runs in real human units: a pilot is 1.8 m tall, gravity is 9.81 m/s².
// The game world is much smaller (a pilot is ~3 cm in the office), so every value
// crosses this boundary through toPhysics / toWorld. Making the players twice as
// small only changes ACTOR_UNIT: the feel of the physics is untouched.
export const HUMAN_HEIGHT = 1.8; // metres
export const PILOT_MODEL_UNITS = 5.6; // height of a pilot model, in model units
export const GRAVITY = 9.81;
// Physics metres per model unit (a model unit is ACTOR_UNIT world metres).
export const MODEL_UNIT = HUMAN_HEIGHT / PILOT_MODEL_UNITS;
// World metres per physics metre.
export const WORLD_PER_METRE = ACTOR_UNIT / MODEL_UNIT;
export const toPhysics = (world: number): number => world / WORLD_PER_METRE;
export const toWorld = (metres: number): number => metres * WORLD_PER_METRE;

// Falling from a desk kills a ground vehicle above this drop height (about 6 cm of
// the office, as before the physics engine); kept as a height so that it does not
// depend on the gravity value.
const KILL_DROP = toPhysics(MAP.metres(20) ** 2 / (2 * MAP.metres(9.81)));
export const FALL_KILL_SPEED = Math.sqrt(2 * GRAVITY * KILL_DROP);

/** q * v * q^-1 for a unit quaternion (x, y, z, w). */
export const rotate = (
  q: { x: number; y: number; z: number; w: number },
  v: { x: number; y: number; z: number },
): XYZ => {
  const { x, y, z, w } = q,
    tx = 2 * (y * v.z - z * v.y),
    ty = 2 * (z * v.x - x * v.z),
    tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
};

let loading: Promise<Rapier> | null = null;
// Rapier is a 4 MB script (WebAssembly inlined): load it only when a rig needs
// it. The caller passes the import itself, `() => import('/rapier.js')`, so that
// the build can version the URL; Node tests import the vendor file.
export function loadRapier(
  importer: () => Promise<{ default?: Rapier } & Partial<Rapier>>,
): Promise<Rapier> {
  loading ??= importer().then(async (module) => {
    const rapier = (module.default ?? module) as Rapier;
    await rapier.init();
    return rapier;
  });
  return loading;
}

const FLOOR_CELLS = 40;
const MIN_HALF = 0.005; // metres: thinner solids would be degenerate cuboids
// A solid's geometry as numbers (box corners, then yaw frame), to spot a moved box without
// building strings every step.
const SIG_LENGTH = 10;
function signature(box: Solid, into: Float64Array = new Float64Array(SIG_LENGTH)): Float64Array {
  const f = box.oriented;
  into[0] = box.min.x;
  into[1] = box.min.y;
  into[2] = box.min.z;
  into[3] = box.max.x;
  into[4] = box.max.y;
  into[5] = box.max.z;
  into[6] = f ? f.x : NaN;
  into[7] = f ? f.z : NaN;
  into[8] = f ? f.c : NaN;
  into[9] = f ? f.s : NaN;
  return into;
}
const sameSignature = (a: Float64Array, b: Float64Array): boolean => {
  for (let i = 0; i < SIG_LENGTH; i++)
    if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) return false;
  return true;
};

// Fixed solids of the room in a Rapier world. `colliders` is the game's list of
// Box3 (optionally with a yaw frame, see oriented-collider.ts); the list changes
// when placements are added or removed, so sync() diffs it on every step.
export class PhysicsWorld {
  R: Rapier;
  world: World;
  solids = new Map<Solid, { collider: RapierCollider; signature: Float64Array }>();
  private scratch = new Float64Array(SIG_LENGTH);
  floor: RapierCollider;
  /** Gravity of the world (m/s²). */
  gravity: number;
  /** Shared worlds (src/parked-host.ts): rigs ask for a step, the host steps once. */
  deferred = false;
  private requested = 0;
  /** The decor whose triangles stand for the props' boxes, and their copies here. */
  decor: { addTo(world: World): RapierCollider[] } | null = null;
  decorColliders: RapierCollider[] = [];

  /**
   * `floorHalf`: a flat heightfield floor (physics metres from the centre) instead of the huge
   * slab: a shape cast against a very wide cuboid loses precision (a character controller ends
   * centimetres inside it), a heightfield made of small cells does not.
   */
  constructor(RAPIER: Rapier, { gravity = GRAVITY, floorHalf = 0 } = {}) {
    this.R = RAPIER;
    this.gravity = gravity;
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    // The office floor (y = 0) is a wide slab, not a box of the layout.
    this.floor = this.world.createCollider(
      (floorHalf > 0
        ? RAPIER.ColliderDesc.heightfield(
            FLOOR_CELLS,
            FLOOR_CELLS,
            new Float32Array((FLOOR_CELLS + 1) ** 2),
            { x: 2 * floorHalf, y: 1, z: 2 * floorHalf },
          )
        : RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0)
      ).setFriction(1),
    );
  }

  addSolid(box: Solid): RapierCollider {
    const R = this.R,
      f = box.oriented,
      b = colliderBounds(box);
    // The local rectangle is relative to the frame origin; y is already world y.
    const lx = (b.min.x + b.max.x) / 2,
      lz = (b.min.z + b.max.z) / 2,
      cx = f ? f.x + f.c * lx + f.s * lz : lx,
      cz = f ? f.z - f.s * lx + f.c * lz : lz,
      cy = (box.min.y + box.max.y) / 2,
      half = [(b.max.x - b.min.x) / 2, (box.max.y - box.min.y) / 2, (b.max.z - b.min.z) / 2].map(
        (v) => Math.max(MIN_HALF, toPhysics(v)),
      ) as [number, number, number];
    const yaw = f ? Math.atan2(f.s, f.c) : 0;
    const desc = R.ColliderDesc.cuboid(...half)
      .setTranslation(toPhysics(cx), toPhysics(cy), toPhysics(cz))
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setFriction(0.4);
    return this.world.createCollider(desc);
  }

  /**
   * Uses the props' real triangles (office-collision.ts) instead of their boxes:
   * copies the decor's trimesh colliders into this world, once per decor.
   */
  useDecor(decor: { addTo(world: World): RapierCollider[] } | null | undefined): void {
    if ((decor ?? null) === this.decor) return;
    for (const c of this.decorColliders) this.world.removeCollider(c, false);
    this.decor = decor ?? null;
    this.decorColliders = decor ? decor.addTo(this.world) : [];
  }

  private walled = false;
  /**
   * Invisible walls round the room (inner faces at ±halfX and ±halfZ, game metres, up to
   * `height`), once per world: the room has no front wall, and an aircraft that leaves it
   * must meet a contact like any other, not a rule of its own.
   */
  addRoomWalls(halfX: number, halfZ: number, height: number): void {
    if (this.walled) return;
    this.walled = true;
    const R = this.R,
      thick = toPhysics(1),
      h = toPhysics(height) / 2,
      hx = toPhysics(halfX),
      hz = toPhysics(halfZ);
    const wall = (x: number, z: number, ex: number, ez: number): void => {
      this.world.createCollider(
        R.ColliderDesc.cuboid(ex, h, ez).setTranslation(x, h, z).setFriction(0.4),
      );
    };
    wall(hx + thick, 0, thick, hz + 2 * thick);
    wall(-hx - thick, 0, thick, hz + 2 * thick);
    wall(0, hz + thick, hx + 2 * thick, thick);
    wall(0, -hz - thick, hx + 2 * thick, thick);
  }

  /** Mirrors the game's solids; returns true when a solid was added, moved or removed. */
  sync(allColliders: readonly Solid[]): boolean {
    // With the decor's triangles here, the pack props' boxes are left out.
    const colliders = this.decor
      ? allColliders.filter((b) => !(b as Solid & { decor?: boolean }).decor)
      : allColliders;
    let changed = false;
    {
      const live = new Set(colliders);
      for (const [box, entry] of this.solids)
        if (!live.has(box)) {
          this.world.removeCollider(entry.collider, false);
          this.solids.delete(box);
          changed = true;
        }
    }
    for (const box of colliders) {
      const known = this.solids.get(box);
      signature(box, this.scratch);
      if (known && sameSignature(known.signature, this.scratch)) continue;
      if (known) this.world.removeCollider(known.collider, false);
      this.solids.set(box, { collider: this.addSolid(box), signature: signature(box) });
      changed = true;
    }
    return changed;
  }

  step(dt: number): void {
    if (this.deferred) {
      this.requested = dt;
      return;
    }
    this.world.timestep = dt;
    this.world.step();
  }

  /** Steps a shared world once for all the rigs that asked for a step. */
  flush(): void {
    if (!this.requested) return;
    this.world.timestep = this.requested;
    this.requested = 0;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
    this.solids.clear();
  }
}
