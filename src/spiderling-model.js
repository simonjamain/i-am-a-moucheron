import { SPIDERLING_DATA as D } from './spiderling-data.js';
import { defineCreature, TAU } from './rigged-creature.ts';
import { walkLegs, groundPresentation, REST_PHASES } from './walker-gait.ts';

// Spiderling (hatched by an egg-laying spider): user-supplied Meshy "Grumpy
// Spider" with its 29-bone SmartRig (no clip). Same walker chain as the big
// spider: alternating tetrapod gait, feet planted by a two-bone solve per leg,
// phase driven by the distance covered. Leg weights are cleaned at import
// (scripts/import-creature.py): each shell keeps its own chain, the duplicate
// chain of leg 2 +X is folded into one. The short front pair (two bones)
// moves like palps; the six other legs walk.
// The model faces +Z, +X is its left side.
export const SPIDERLING_MODEL = Object.freeze({
  scale: 0.5, // 4.2 m model, legs spread -> 2.1 insect units, like the other walkers
  stride: 0.7, // model metres per cycle
  lift: 0.22,
  frames: 40,
  maxRate: 10, // apparent gait rate cap (cycles/s): small and fast
  // Insect units above the shared foot height: planted tibiae pivot about the
  // foot and dip their far end (see ROACH_MODEL.raise).
  raise: 0.025,
});
// Hit volume in insect units (ellipsoid centre and radii): body and the inner
// half of the legs, close to the former 1.2-unit hit sphere, so these small,
// fast swarms stay as easy to shoot as before.
export const SPIDERLING_HIT = Object.freeze({ centre: [0, 0.12, 0.05], radii: [1.05, 0.6, 1.1] });

export const SPIDERLING_BONES = Object.freeze({
  root: 'Bone_000',
  head: 'Bone_001',
  abdomen: ['Bone_022', 'Bone_021'],
  // The short front pair (two bones each) does not walk: it feels the way
  // ahead like a pair of palps, +X first.
  palps: [
    ['Bone_003', 'Bone_002'],
    ['Bone_005', 'Bone_004'],
  ],
  // hip, knee and tarsus bones of the six walking legs, front to rear; group 0
  // swings first.
  legs: [
    { hip: 'Bone_014', knee: 'Bone_013', tip: 'Bone_012', group: 1, centre: -0.1 }, // 2 +X
    { hip: 'Bone_011', knee: 'Bone_010', tip: 'Bone_009', group: 0, centre: -0.1 }, // 2 -X
    { hip: 'Bone_020', knee: 'Bone_019', tip: 'Bone_018', group: 0, centre: 0 }, // 3 +X
    { hip: 'Bone_017', knee: 'Bone_016', tip: 'Bone_015', group: 1, centre: 0 }, // 3 -X
    { hip: 'Bone_028', knee: 'Bone_027', tip: 'Bone_026', group: 1, centre: 0.1 }, // 4 +X
    { hip: 'Bone_025', knee: 'Bone_024', tip: 'Bone_023', group: 0, centre: 0.1 }, // 4 -X
  ],
});

export function spiderlingWalkPose(T, t, h) {
  const e = h.euler;
  const step = TAU * 2 * t;
  const cycle = TAU * t;
  const pose = {};
  // Light body: a quick bounce on each step and a small roll.
  const body = {
    pivot: h.bind(SPIDERLING_BONES.root),
    offset: new T.Vector3(0, 0.04 * (0.5 - 0.5 * Math.cos(step)), 0),
    rotation: e(0.015 * Math.sin(step + 1), 0, 0.03 * Math.sin(cycle)),
  };
  pose[SPIDERLING_BONES.root] = { offset: body.offset.toArray(), rotation: body.rotation };
  walkLegs(
    pose,
    h,
    { legs: SPIDERLING_BONES.legs, stride: SPIDERLING_MODEL.stride, lift: SPIDERLING_MODEL.lift },
    t,
    body,
  );
  // Palps lifted off the floor, tapping alternately.
  SPIDERLING_BONES.palps.forEach(([base, tip], k) => {
    const s = k ? -1 : 1;
    const tap = Math.sin(step + k * Math.PI);
    pose[base] = { rotation: e(-0.35 - 0.12 * tap, 0, s * 0.15) };
    pose[tip] = { rotation: e(-0.2 - 0.1 * tap, 0, 0) };
  });
  // Abdomen bobs and sways behind the steps.
  SPIDERLING_BONES.abdomen.forEach((name, k) => {
    pose[name] = {
      rotation: e(
        -0.03 + 0.03 * Math.sin(step - 1 - k * 0.6),
        0.07 * Math.sin(cycle - 0.7 - k * 0.5),
        0,
      ),
    };
  });
  return pose;
}

export const SPIDERLING = defineCreature(D, {
  name: 'bebe-araignee',
  presentation: (T) =>
    new T.Matrix4()
      .makeTranslation(0, SPIDERLING_MODEL.raise, 0)
      .multiply(groundPresentation(T, SPIDERLING_MODEL.scale)),
  pose: spiderlingWalkPose,
  rest: REST_PHASES[0],
  frames: SPIDERLING_MODEL.frames,
});
