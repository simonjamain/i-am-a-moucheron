import { ROACH_DATA as D } from './roach-data.ts';
import { defineCreature, TAU } from './rigged-creature.ts';
import type { CreatureHelpers } from './rigged-creature.ts';
import { walkLegs, groundPresentation, REST_PHASES } from './walker-gait.ts';
import type { GaitHelpers, Pose } from './walker-gait.ts';
import type { Three } from './types.ts';

// lowest() of the creature helpers may return null; the gait expects a bone tip.
type WalkerHelpers = CreatureHelpers & GaitHelpers;

// Cockroach enemy: user-supplied Meshy "Low Poly Cockroach" with its 40-bone
// SmartRig (no clip). Cross-leg weights are cleaned at import
// (scripts/import-creature.py). The walk is an alternating tripod gait, like
// the ant's but lower and flatter: front-left, mid-right and rear-left legs
// swing together, then the other three. Feet are planted by a two-bone solve
// per leg; the abdomen sways, the head bobs and the long antennae sweep. The
// model faces +Z, +X is its left side.
export const ROACH_MODEL = Object.freeze({
  scale: 0.52, // 4.1 m model, antennae included -> 2.1 insect units
  stride: 0.6, // model metres per cycle
  lift: 0.14,
  frames: 60,
  maxRate: 9, // apparent gait rate cap (cycles/s), see ANT_MODEL
  // Insect units above the shared foot height: the tibiae run almost flat on
  // the floor up to the foot, so a leg pivoting about its planted foot dips the
  // tibia's other end; this keeps every vertex above the walkers' foot line.
  raise: 0.035,
});
// Hit volume in insect units (ellipsoid centre and radii): body without legs
// or antennae.
export const ROACH_HIT = Object.freeze({ centre: [0, 0.1, 0.2], radii: [0.48, 0.32, 0.95] });

export const ROACH_BONES = Object.freeze({
  root: 'Bone_000',
  head: 'Bone_005',
  abdomen: ['Bone_003', 'Bone_002'],
  antennae: [
    ['Bone_034', 'Bone_033', 'Bone_032', 'Bone_031', 'Bone_030'], // +X
    ['Bone_039', 'Bone_038', 'Bone_037', 'Bone_036', 'Bone_035'], // -X
  ],
  // Hip (coxa-femur), knee (tibia) and foot bone; group 0 swings first. Front
  // legs reach forward and rear legs backward: their strides are re-centred.
  legs: [
    { hip: 'Bone_017', knee: 'Bone_016', tip: 'Bone_014', group: 0, centre: -0.15 }, // front +X
    { hip: 'Bone_021', knee: 'Bone_020', tip: 'Bone_018', group: 1, centre: -0.15 }, // front -X
    { hip: 'Bone_009', knee: 'Bone_008', tip: 'Bone_006', group: 1, centre: 0 }, // mid +X
    { hip: 'Bone_013', knee: 'Bone_012', tip: 'Bone_010', group: 0, centre: 0 }, // mid -X
    { hip: 'Bone_025', knee: 'Bone_024', tip: 'Bone_022', group: 0, centre: 0.15 }, // rear +X
    { hip: 'Bone_029', knee: 'Bone_028', tip: 'Bone_026', group: 1, centre: 0.15 }, // rear -X
  ],
});

export function roachWalkPose(T: Three, t: number, h: WalkerHelpers): Pose {
  const e = h.euler;
  const step = TAU * 2 * t; // two steps per cycle
  const cycle = TAU * t;
  const pose: Pose = {};
  // Low body: a slight bounce on each step, roll towards the planted tripod.
  const body = {
    pivot: h.bind(ROACH_BONES.root),
    offset: new T.Vector3(0, 0.015 * (0.5 - 0.5 * Math.cos(step)), 0),
    rotation: e(0.01 * Math.sin(step), 0, 0.025 * Math.sin(cycle)),
  };
  pose[ROACH_BONES.root] = { offset: body.offset.toArray(), rotation: body.rotation };
  walkLegs(
    pose,
    h,
    { legs: ROACH_BONES.legs, stride: ROACH_MODEL.stride, lift: ROACH_MODEL.lift },
    t,
    body,
  );
  // Abdomen sways against the roll; head bobs with the steps.
  ROACH_BONES.abdomen.forEach((name, k) => {
    pose[name] = {
      rotation: e(0.03 * Math.sin(step - 0.8 - k * 0.5), -0.06 * Math.sin(cycle - k * 0.6), 0),
    };
  });
  pose[ROACH_BONES.head] = { rotation: e(0.04 * Math.sin(step + 1), 0.04 * Math.sin(cycle), 0) };
  // Long antennae sweep side to side, out of phase, with a wave towards the tip.
  ROACH_BONES.antennae.forEach((chain, side) => {
    chain.forEach((name, k) => {
      pose[name] = {
        rotation: e(
          0.06 * Math.sin(step + side * 1.7 - k * 0.7),
          0.12 * Math.sin(cycle + side * Math.PI - k * 0.5),
          0,
        ),
      };
    });
  });
  return pose;
}

export const ROACH = defineCreature(D, {
  name: 'cafard',
  presentation: (T) =>
    new T.Matrix4()
      .makeTranslation(0, ROACH_MODEL.raise, 0)
      .multiply(groundPresentation(T, ROACH_MODEL.scale)),
  pose: roachWalkPose,
  rest: REST_PHASES[0],
  frames: ROACH_MODEL.frames,
});
