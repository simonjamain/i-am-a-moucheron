// Placed objects of the purchased office pack (see office-pack-catalog.ts): pure
// data shared by the client, the server and the workers. A prop is one model at a
// floor position with a yaw; its hitboxes come from HITBOXES (model frame), turned
// by the yaw into world axis-aligned colliders. Models face +X in their own frame
// (desk drawers, screens, wall-mounted items whose back is on x = 0).
import { OFFICE_MODELS, type OfficeModel } from './office-pack-catalog.ts';
import type { Collider } from './oriented-collider.ts';

export type { OfficeModel };
/** One model placed in the room: (x, y, z) is its origin, yaw turns it around Y. */
export interface Prop {
  model: OfficeModel;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Drawn only: the room shell walls, whose colliders are the shell's own. */
  ghost?: true;
}
/** Box in a model frame: [minX, minY, minZ, maxX, maxY, maxZ], metres. */
export type LocalBox = readonly [number, number, number, number, number, number];

/** Yaw that turns a model's front (+X) toward a direction of the room. */
export const FACE = Object.freeze({
  east: 0,
  north: Math.PI / 2,
  west: Math.PI,
  south: -Math.PI / 2,
});
export type Facing = keyof typeof FACE;

// Hand-measured hitboxes of models that are not plain blocks (tables, desks: one
// can pass under them), and the models that never collide (wall shell, drawn and
// collided separately; flat items on walls). Any other model collides with its
// bounds, except small items (all sides under SMALL), which never block.
const SMALL = 0.15;
const NONE: readonly LocalBox[] = [];
const HITBOXES: Partial<Record<OfficeModel, readonly LocalBox[]>> = {
  Desk: [
    [-0.379, 0.7, -0.754, 0.379, 0.74, 0.754],
    [-0.345, 0, -0.73, 0.36, 0.7, -0.29],
    [-0.345, 0, 0.69, 0.345, 0.7, 0.73],
    [-0.315, 0.18, -0.295, -0.295, 0.7, 0.7],
  ],
  Coffee_Table: [
    [-0.279, 0.39, -0.504, 0.279, 0.42, 0.504],
    [-0.25, 0, -0.475, 0.25, 0.39, -0.425],
    [-0.25, 0, 0.425, 0.25, 0.39, 0.475],
  ],
  // Inside the room (partitions): body and skirting boards.
  // Counter body only: the tap stands above its top (0.9 m), where things are put.
  Kitchen_Counter: [[-0.31, 0, -0.61, 0.32, 0.9, 0.61]],
  Wall: [
    [-0.056, 0, -0.6, 0.056, 2.7, 0.6],
    [-0.073, 0, -0.6, 0.073, 0.1, 0.6],
  ],
  Wall_Half: [
    [-0.056, 0, -0.3, 0.056, 2.7, 0.3],
    [-0.073, 0, -0.3, 0.073, 0.1, 0.3],
  ],
  Wall_Corner: NONE,
  Wall_Window: NONE,
  Wall_Door: NONE,
  Office_Door: NONE,
  Wall_Vent: NONE,
  Wall_Clock: NONE,
  Wall_Calendar: NONE,
  Corkboard: NONE,
  Wall_Outlet: NONE,
  Light_Switch: NONE,
  Paper_Crumpled_Sheet: NONE,
};

/** Hitboxes of a model in its own frame. */
export function modelBoxes(model: OfficeModel): readonly LocalBox[] {
  const own = HITBOXES[model];
  if (own) return own;
  const { min, max } = OFFICE_MODELS[model];
  if (Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) < SMALL) return NONE;
  return [[min[0], min[1], min[2], max[0], max[1], max[2]]];
}

// World axis-aligned bounds of a local box turned by `yaw` and moved to the prop.
function worldBox(p: Prop, b: LocalBox): Collider {
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const lx of [b[0], b[3]])
    for (const lz of [b[2], b[5]]) {
      // Three.js yaw: local +X goes to (cos, 0, -sin), local +Z to (sin, 0, cos).
      const x = p.x + c * lx + s * lz,
        z = p.z - s * lx + c * lz;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return {
    min: { x: r(x0), y: r(p.y + b[1]), z: r(z0) },
    max: { x: r(x1), y: r(p.y + b[4]), z: r(z1) },
  };
}
/** World colliders of a prop. */
export function propColliders(p: Prop): Collider[] {
  if (p.ghost) return [];
  return modelBoxes(p.model).map((b) => worldBox(p, b));
}
/** World footprint (x/z bounds) of a prop's whole model. */
export function propFootprint(p: Prop): Collider {
  const { min, max } = OFFICE_MODELS[p.model];
  return worldBox(p, [min[0], min[1], min[2], max[0], max[1], max[2]]);
}
/** Top of a model (its height above its origin). */
export const modelTop = (model: OfficeModel): number => OFFICE_MODELS[model].max[1];
