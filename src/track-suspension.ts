import { colliderContainsXZ, type Collider } from './oriented-collider.ts';
import type * as THREE from 'three';
import { AXLE_Z, GROUND_Y } from './tank-gear.ts';
import { tessellate } from './tessellate.ts';

// Cosmetic suspension of the tank's running gear, computed from the pose and the solid
// colliders alone, so a remote tank (whose rig runs on another machine) is drawn the same way
// as the local one. The physics keeps its own springs (`TankRig.wheelCompression`); both read
// the same terrain, so they agree to within the visual smoothing.

/** Largest wheel travel, in model units, up and down. */
export const WHEEL_TRAVEL = 0.18;
/** Height of the terrain below (x, z), searched from `fromY` down: the highest top that is under. */
export function terrainHeight(
  colliders: readonly Collider[],
  x: number,
  z: number,
  fromY: number,
): number {
  let best = 0;
  for (const box of colliders)
    if (box.max.y <= fromY && box.max.y > best && colliderContainsXZ(box, x, z)) best = box.max.y;
  return best;
}

/**
 * Vertical offset of each axle's wheels (model units, positive = the wheel is pushed up into the
 * hull) for a hull at `position` with the yaw `yaw` and the given pitch/roll ignored: the offset
 * is how much higher the terrain under the wheel is than the flat ground the hull rests on.
 * `unit` is world units per model unit; `groundOffset` is the model height of the hull origin
 * above the ground at rest.
 */
export function axleOffsets(
  colliders: readonly Collider[],
  position: readonly number[],
  yaw: number,
  side: -1 | 1,
  trackX: number,
  unit: number,
  groundOffset: number,
  out: number[] = [],
): number[] {
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const baseY = position[1] - groundOffset * unit;
  AXLE_Z.forEach((z, i) => {
    const x = side * trackX * unit,
      zz = z * unit;
    // Model +z is the back; yaw turns the model about y (three.js convention).
    const wx = position[0] + x * cos + zz * sin,
      wz = position[2] - x * sin + zz * cos;
    const rise = terrainHeight(colliders, wx, wz, baseY + WHEEL_TRAVEL * unit + 1e-6) - baseY;
    out[i] = Math.max(-WHEEL_TRAVEL, Math.min(WHEEL_TRAVEL, rise / unit));
  });
  return out;
}

/**
 * Displacement of a belt vertex at (y, z) in the model frame: the bottom run follows the axle
 * offsets (piecewise linear in z), the top run stays; between them the weight fades with height.
 */
export function beltDisplacement(offsets: readonly number[], y: number, z: number): number {
  const weight = Math.max(0, Math.min(1, (-0.2 - y) / 0.42));
  if (!weight) return 0;
  let k = 0;
  while (k < AXLE_Z.length - 2 && z > AXLE_Z[k + 1]) k++;
  const t = Math.max(0, Math.min(1, (z - AXLE_Z[k]) / (AXLE_Z[k + 1] - AXLE_Z[k])));
  return weight * (offsets[k] * (1 - t) + offsets[k + 1] * t);
}

// ---- Rendering ----------------------------------------------------------------------------

/** Longest edge of a belt triangle after tessellation, in model units (axles are ≥ 0.5 apart). */
const BELT_EDGE = 0.3;

export interface BeltState {
  rest: Float32Array;
  /** Belt node pivot in the hull frame (y, z). */
  pivotY: number;
  pivotZ: number;
}

/** Give each belt a geometry of its own, finely cut so that it can bend. */
export function prepareBelts(T: typeof THREE, tracks: readonly THREE.Object3D[]): void {
  for (const node of tracks) {
    const mesh = node.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const source = mesh.geometry;
    const position = source.getAttribute('position'),
      uv = source.getAttribute('uv'),
      normal = source.getAttribute('normal');
    const cut = tessellate(
      {
        positions: Float32Array.from(position.array),
        uv: Float32Array.from(uv.array),
        ...(normal ? { normals: Float32Array.from(normal.array) } : {}),
        indices: Uint32Array.from(source.getIndex()?.array ?? []),
      },
      BELT_EDGE,
      [0, 1, 1], // a belt is thin across (x): cut along its length and height only
    );
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(cut.positions, 3));
    geometry.setAttribute('uv', new T.BufferAttribute(cut.uv, 2));
    if (cut.normals) geometry.setAttribute('normal', new T.BufferAttribute(cut.normals, 3));
    geometry.setIndex(new T.BufferAttribute(cut.indices, 1));
    mesh.geometry = geometry;
    mesh.frustumCulled = false; // the bounds of the rest pose are not the deformed ones
    node.userData.belt = {
      rest: Float32Array.from(cut.positions),
      pivotY: node.position.y,
      pivotZ: node.position.z,
    } satisfies BeltState;
  }
}

/** Bend a belt to the axle offsets (model units). */
export function bendBelt(node: THREE.Object3D, offsets: readonly number[]): void {
  const belt = node.userData.belt as BeltState | undefined;
  const mesh = node.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (!belt || !mesh) return;
  const attribute = mesh.geometry.getAttribute('position');
  const array = attribute.array as Float32Array;
  for (let i = 0; i < array.length; i += 3) {
    array[i + 1] =
      belt.rest[i + 1] +
      beltDisplacement(offsets, belt.pivotY + belt.rest[i + 1], belt.pivotZ + belt.rest[i + 2]);
  }
  attribute.needsUpdate = true;
}

export interface Suspension {
  /** Smoothed offsets per side (0 = left), per axle. */
  sides: [number[], number[]];
  /** The two wheels of each axle (left, right) and their rest height. */
  axles: THREE.Object3D[][];
  rest: number[][];
}

/** Collect the wheels per axle (rig node names) for `updateSuspension`. */
export function prepareSuspension(
  nodes: Record<string, THREE.Object3D>,
  axleParts: readonly (readonly [string, string])[],
): Suspension {
  const axles = axleParts.map((pair) => pair.map((name) => nodes[name]));
  return {
    sides: [
      new Array<number>(axleParts.length).fill(0),
      new Array<number>(axleParts.length).fill(0),
    ],
    axles,
    rest: axles.map((pair) => pair.map((wheel) => wheel.position.y)),
  };
}

const RESPONSE = 14; // 1/s: how fast the wheels follow the terrain

/** Ride the wheels and bend the belts of the tank model `g` on the terrain below it. */
export function updateSuspension(
  g: THREE.Object3D,
  suspension: Suspension,
  tracks: readonly THREE.Object3D[],
  colliders: readonly Collider[],
  trackX: number,
  dt: number,
): void {
  const unit = g.scale.x,
    yaw = Math.atan2(
      2 * (g.quaternion.w * g.quaternion.y + g.quaternion.x * g.quaternion.z),
      1 - 2 * (g.quaternion.y * g.quaternion.y + g.quaternion.x * g.quaternion.x),
    );
  const position = [g.position.x, g.position.y, g.position.z];
  const k = Math.min(1, dt * RESPONSE);
  const raw: number[] = [];
  ([-1, 1] as const).forEach((side, s) => {
    axleOffsets(colliders, position, yaw, side, trackX, unit, -GROUND_Y, raw);
    const smooth = suspension.sides[s];
    for (let i = 0; i < raw.length; i++) smooth[i] += (raw[i] - smooth[i]) * k;
    suspension.axles.forEach((pair, i) => {
      pair[s].position.y = suspension.rest[i][s] + smooth[i];
    });
    bendBelt(tracks[s], smooth);
  });
}
