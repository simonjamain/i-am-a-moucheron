import { ANT_DATA as D } from './ant-data.js';
import { defineCreature, TAU } from './rigged-creature.js';
import { walkLegs, groundPresentation, REST_PHASES } from './walker-gait.js';

// Ant enemy: user-supplied Meshy "Red Ant Warrior" with its 52-bone SmartRig
// (no clip). The walk is an alternating tripod gait: front-left, mid-right and
// rear-left legs swing together, then the other three. Feet are planted by a
// two-bone solve per leg; body, gaster, head, antennae and mandibles add
// secondary motion. The model faces +Z, +X is its left side.
export const ANT_MODEL = Object.freeze({
  scale: 0.6, // 3.5 m model -> 2.1 insect units (17 mm in the office)
  stride: 0.5, // model metres per cycle
  lift: 0.12,
  frames: 60,
  // Apparent gait rate cap (cycles/s): a 17 mm ant at game speed would need
  // 35 cycles/s, a strobe of legs; above the cap the feet slide a little.
  maxRate: 8,
});
// Hit volume in insect units (ellipsoid centre and radii): body without legs.
export const ANT_HIT = Object.freeze({ centre: [0, 0.18, 0], radii: [0.4, 0.42, 1.05] });

export const ANT_BONES = Object.freeze({
  root: 'Bone_000',
  thorax: 'Bone_004',
  head: 'Bone_002',
  mandibles: [
    ['Bone_049', 'Bone_041'], // +X
    ['Bone_051'], // -X
  ],
  antennae: [
    ['Bone_044', 'Bone_043'], // +X
    ['Bone_047', 'Bone_046'], // -X
  ],
  gaster: ['Bone_007', 'Bone_006', 'Bone_005'],
  // hip (coxa), knee (femur/tibia) and toe bone; group 0 swings first.
  legs: [
    { hip: 'Bone_022', knee: 'Bone_021', tip: 'Bone_018', group: 0, centre: -0.12 }, // front +X
    { hip: 'Bone_027', knee: 'Bone_026', tip: 'Bone_023', group: 1, centre: -0.12 }, // front -X
    { hip: 'Bone_017', knee: 'Bone_016', tip: 'Bone_013', group: 1, centre: 0 }, // mid +X
    { hip: 'Bone_012', knee: 'Bone_011', tip: 'Bone_008', group: 0, centre: 0 }, // mid -X
    { hip: 'Bone_032', knee: 'Bone_031', tip: 'Bone_028', group: 0, centre: 0.1 }, // rear +X
    { hip: 'Bone_037', knee: 'Bone_036', tip: 'Bone_033', group: 1, centre: 0.1 }, // rear -X
  ],
});

export function antWalkPose(T, t, h) {
  const e = h.euler;
  const step = TAU * 2 * t; // two steps per cycle
  const cycle = TAU * t;
  const pose = {};
  // Body: small bounce on each step, slight roll towards the planted tripod.
  const body = {
    pivot: h.bind(ANT_BONES.root),
    offset: new T.Vector3(0, 0.02 * (0.5 - 0.5 * Math.cos(step)), 0),
    rotation: e(0.015 * Math.sin(step), 0, 0.03 * Math.sin(cycle)),
  };
  pose[ANT_BONES.root] = { offset: body.offset.toArray(), rotation: body.rotation };
  walkLegs(
    pose,
    h,
    { legs: ANT_BONES.legs, stride: ANT_MODEL.stride, lift: ANT_MODEL.lift },
    t,
    body,
  );
  // Gaster sways against the roll and bobs; head nods, antennae feel ahead.
  ANT_BONES.gaster.forEach((name, k) => {
    pose[name] = {
      rotation: e(0.04 * Math.sin(step - 0.8 - k * 0.5), -0.05 * Math.sin(cycle - k * 0.6), 0),
    };
  });
  pose[ANT_BONES.head] = { rotation: e(0.04 * Math.sin(step + 1), 0.03 * Math.sin(cycle), 0) };
  ANT_BONES.antennae.forEach((chain, side) => {
    const s = side ? -1 : 1;
    chain.forEach((name, k) => {
      pose[name] = {
        rotation: e(0.14 * Math.sin(step + side * 2.1 - k), 0, s * 0.08 * Math.sin(cycle + k)),
      };
    });
  });
  // Mandibles open outwards (about +Y for the +X side) once per cycle.
  const open = 0.08 + 0.08 * Math.sin(cycle + 0.5);
  ANT_BONES.mandibles.forEach((bones, side) => {
    for (const name of bones) pose[name] = { rotation: e(0, (side ? -1 : 1) * open, 0) };
  });
  return pose;
}

export const ANT = defineCreature(D, {
  name: 'fourmi',
  presentation: (T) => groundPresentation(T, ANT_MODEL.scale),
  pose: antWalkPose,
  rest: REST_PHASES[0],
  frames: ANT_MODEL.frames,
});
