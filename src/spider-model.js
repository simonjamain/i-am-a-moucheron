import { SPIDER_DATA as D } from './spider-data.js';
import { defineCreature, TAU } from './rigged-creature.js';
import { walkLegs, groundPresentation, REST_PHASES } from './walker-gait.js';

// Egg-laying spider: user-supplied Meshy "Spotted Velvet Spider" with its
// 30-bone SmartRig (no clip). The walk is an alternating tetrapod gait: legs
// 1 and 3 of one side swing with legs 2 and 4 of the other, then the reverse.
// Feet are planted by a two-bone solve per leg (hip, knee, tarsus); the
// abdomen bounces and sways. The model faces +Z, +X is its left side.
export const SPIDER_MODEL = Object.freeze({
  scale: 0.6, // 3.5 m model -> 2.1 insect units (48 mm wide in the office)
  stride: 0.6, // model metres per cycle
  lift: 0.2,
  frames: 60,
  maxRate: 5, // apparent gait rate cap (cycles/s), see ANT_MODEL
});
// Hit volume in insect units (ellipsoid centre and radii): body without legs.
export const SPIDER_HIT = Object.freeze({ centre: [0, 0.15, 0], radii: [0.6, 0.5, 1.0] });

export const SPIDER_BONES = Object.freeze({
  root: 'Bone_000',
  body: 'Bone_001',
  abdomen: ['Bone_023', 'Bone_022'],
  // hip, knee and tarsus bones, front to rear; group 0 swings first. Front legs
  // point forward, so their stride is centred behind the bind pose.
  legs: [
    { hip: 'Bone_006', knee: 'Bone_005', tip: 'Bone_004', group: 0, centre: -0.3 }, // 1 +X
    { hip: 'Bone_009', knee: 'Bone_008', tip: 'Bone_007', group: 1, centre: -0.3 }, // 1 -X
    { hip: 'Bone_012', knee: 'Bone_011', tip: 'Bone_010', group: 1, centre: -0.15 }, // 2 +X
    { hip: 'Bone_015', knee: 'Bone_014', tip: 'Bone_013', group: 0, centre: -0.15 }, // 2 -X
    { hip: 'Bone_021', knee: 'Bone_020', tip: 'Bone_019', group: 0, centre: 0 }, // 3 +X
    { hip: 'Bone_018', knee: 'Bone_017', tip: 'Bone_016', group: 1, centre: 0 }, // 3 -X
    { hip: 'Bone_029', knee: 'Bone_028', tip: 'Bone_027', group: 1, centre: 0.1 }, // 4 +X
    { hip: 'Bone_026', knee: 'Bone_025', tip: 'Bone_024', group: 0, centre: 0.1 }, // 4 -X
  ],
});

export function spiderWalkPose(T, t, h) {
  const e = h.euler;
  const step = TAU * 2 * t;
  const cycle = TAU * t;
  const pose = {};
  // Heavy body: a low bounce on each step and a slow roll towards the planted set.
  const body = {
    pivot: h.bind(SPIDER_BONES.root),
    offset: new T.Vector3(0, 0.03 * (0.5 - 0.5 * Math.cos(step)), 0),
    rotation: e(0.01 * Math.sin(step + 1), 0, 0.025 * Math.sin(cycle)),
  };
  pose[SPIDER_BONES.root] = { offset: body.offset.toArray(), rotation: body.rotation };
  walkLegs(
    pose,
    h,
    { legs: SPIDER_BONES.legs, stride: SPIDER_MODEL.stride, lift: SPIDER_MODEL.lift },
    t,
    body,
  );
  // Abdomen lags behind the steps: pitch bounce and side sway.
  SPIDER_BONES.abdomen.forEach((name, k) => {
    pose[name] = {
      rotation: e(0.05 * Math.sin(step - 1 - k * 0.6), 0.06 * Math.sin(cycle - 0.7 - k * 0.5), 0),
    };
  });
  return pose;
}

export const SPIDER = defineCreature(D, {
  name: 'araignee',
  presentation: (T) => groundPresentation(T, SPIDER_MODEL.scale),
  pose: spiderWalkPose,
  rest: REST_PHASES[0],
  frames: SPIDER_MODEL.frames,
});
