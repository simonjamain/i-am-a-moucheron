import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider as RapierCollider, World } from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
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

const MIN_HALF = 0.005; // metres: thinner solids would be degenerate cuboids
const signature = (box: Solid): string => {
  const f = box.oriented;
  return (
    [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].join(',') +
    (f ? '|' + [f.x, f.z, f.c, f.s].join(',') : '')
  );
};

// Fixed solids of the room in a Rapier world. `colliders` is the game's list of
// Box3 (optionally with a yaw frame, see oriented-collider.ts); the list changes
// when placements are added or removed, so sync() diffs it on every step.
export class PhysicsWorld {
  R: Rapier;
  world: World;
  solids = new Map<Solid, { collider: RapierCollider; signature: string }>();
  floor: RapierCollider;

  constructor(RAPIER: Rapier, { gravity = GRAVITY } = {}) {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    // The office floor (y = 0) is a wide slab, not a box of the layout.
    this.floor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(5000, 1, 5000).setTranslation(0, -1, 0).setFriction(1),
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

  sync(colliders: readonly Solid[]): void {
    const live = new Set(colliders);
    for (const [box, entry] of this.solids)
      if (!live.has(box)) {
        this.world.removeCollider(entry.collider, false);
        this.solids.delete(box);
      }
    for (const box of colliders) {
      const known = this.solids.get(box),
        now = signature(box);
      if (known?.signature === now) continue;
      if (known) this.world.removeCollider(known.collider, false);
      this.solids.set(box, { collider: this.addSolid(box), signature: now });
    }
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
    this.solids.clear();
  }
}
