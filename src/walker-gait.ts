// Shared walking cycle for rigged ground creatures (ant, spider): planted
// feet slide backwards at the body's speed, lift in an arc during the swing,
// and a two-bone leg solve (src/rigged-creature.js) turns hip and knee so the
// foot reaches its target. The cycle phase is one stride (0..1); the client
// advances it with the distance travelled, so feet never slide on the floor.
import type * as THREE from 'three';
import { GROUND_FOOT_DEPTH, GROUND_FOOT_CLEARANCE } from './scale.ts';
import type { Three } from './types.ts';

/** One leg of a rig: bone names, swing group (0 or 1) and forward foot offset. */
export interface LegSpec {
  hip: string;
  knee: string;
  tip: string;
  group: number;
  centre?: number;
}
export interface GaitSpecies {
  legs: readonly LegSpec[];
  stride: number;
  lift: number;
}
export interface FootTarget {
  forward: number;
  up: number;
  swing: boolean;
}
export interface LegSolution {
  hipDelta: THREE.Quaternion;
  kneeDelta: THREE.Quaternion;
}
/** Subset of the rigged-creature helpers (src/rigged-creature.js) used here. */
export interface GaitHelpers {
  bind(name: string): THREE.Vector3;
  lowest(name: string): THREE.Vector3;
  solveLeg(
    hip: THREE.Vector3,
    knee: THREE.Vector3,
    foot: THREE.Vector3,
    target: THREE.Vector3,
    bindHip?: THREE.Vector3,
  ): LegSolution;
}
export interface BodyMotion {
  pivot: THREE.Vector3;
  rotation?: THREE.Quaternion;
  offset?: THREE.Vector3;
}
/** Model-space bone deltas keyed by bone name. */
export type Pose = Record<string, { rotation?: THREE.Quaternion; offset?: number[] }>;

// Fraction of the cycle a leg spends in the air. Legs in group 0 swing at
// phase 0..SWING, group 1 at 0.5..0.5+SWING, so every foot is planted around
// REST_PHASES (the poses a stopped creature settles into).
export const SWING = 0.4;
export const REST_PHASES = Object.freeze([0.45, 0.95]);
export const nearestRest = (phase: number): number => {
  const p = ((phase % 1) + 1) % 1;
  let best = p,
    distance = Infinity;
  for (const rest of REST_PHASES)
    for (const turn of [-1, 0, 1]) {
      const d = Math.abs(rest + turn - p);
      if (d < distance) ((distance = d), (best = rest + turn));
    }
  return best;
};

// Foot target offsets (forward along +Z, up along +Y) for a leg whose swing
// starts at `offset`, with the body moving towards +Z.
export function footCycle(phase: number, offset: number, stride: number, lift: number): FootTarget {
  const u = (((phase - offset) % 1) + 1) % 1;
  if (u < SWING) {
    const s = u / SWING;
    return {
      forward: (-Math.cos(Math.PI * s) * stride) / 2,
      up: Math.sin(Math.PI * s) * lift,
      swing: true,
    };
  }
  const v = (u - SWING) / (1 - SWING);
  return { forward: (stride * (1 - 2 * v)) / 2, up: 0, swing: false };
}

// Pose the legs of `species` ({ legs: [{hip, knee, tip, group, centre}],
// stride, lift }) at `phase`, with the body rotated by `body.rotation` around
// `body.pivot` and shifted by `body.offset` (model space). Writes into `pose`.
export function walkLegs(
  pose: Pose,
  h: GaitHelpers,
  species: GaitSpecies,
  phase: number,
  body: BodyMotion | null = null,
): Pose {
  const inverseBody = body?.rotation ? body.rotation.clone().invert() : null;
  for (const leg of species.legs) {
    const hip = h.bind(leg.hip),
      knee = h.bind(leg.knee),
      tip = h.lowest(leg.tip);
    const foot = footCycle(phase, leg.group * 0.5, species.stride, species.lift);
    const target = tip.clone();
    target.z += (leg.centre || 0) + foot.forward;
    target.y += foot.up;
    let hipNow = hip.clone();
    if (body) {
      if (body.rotation) hipNow.sub(body.pivot).applyQuaternion(body.rotation).add(body.pivot);
      if (body.offset) hipNow.add(body.offset);
    }
    const solved = h.solveLeg(hipNow, knee, tip, target, hip);
    pose[leg.hip] = {
      rotation: inverseBody ? inverseBody.clone().multiply(solved.hipDelta) : solved.hipDelta,
    };
    pose[leg.knee] = { rotation: solved.kneeDelta };
  }
  return pose;
}

// Presentation for a ground walker: model metres (feet at y = 0, head +Z) ->
// game insect units, head towards -Z, feet just above the shared ground lift.
export function groundPresentation(T: Three, scale: number): THREE.Matrix4 {
  const feetY = -GROUND_FOOT_DEPTH + GROUND_FOOT_CLEARANCE;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(scale, scale, scale))
    .multiply(new T.Matrix4().makeTranslation(0, feetY / scale, 0));
}
