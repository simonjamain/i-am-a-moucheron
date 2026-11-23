import { BEE_DATA as D } from './bee-data.js';
import { defineCreature, TAU } from './rigged-creature.ts';
import type { CreatureHelpers, CreaturePose } from './rigged-creature.ts';
import type * as THREE from 'three';
import type { Three } from './types.ts';

// Bee (`guard`): user-supplied Meshy "Angry Low Poly Bee" with its 45-bone
// SmartRig (no clip). Weights are cleaned at import (scripts/import-bee.py):
// each fore and hind wing pair follows its wing root bone rigidly, as a real
// bee hooks its two wings together. The flight cycle below poses the bones
// procedurally: fast wing beat, abdomen tilted down and pumping, legs hanging,
// antennae twitching. The model faces +Z, Y is up, so +X is its left side.

// One loop holds an integer number of wing beats so every secondary motion
// loops with it; the shared clock drives it (src/creature-batch.js).
export const BEE_FLIGHT = Object.freeze({
  loop: 1, // seconds
  beats: 12, // wing beats per loop: a quick buzz, faster than the beetle
  framesPerBeat: 6,
  frames: 72,
  // Wing elevation (rad, above horizontal) at the top and bottom of the stroke.
  wingUp: 0.9,
  wingDown: -0.35,
  // Angle behind the lateral axis (rad): mean and half range over a stroke.
  wingSweep: 0.35,
  wingSweepRange: 0.45,
  wingTwist: 0.4,
});
// Presentation in game insect units: head towards -Z (client heading), body
// centre at the origin, about 1.6 units long sting included.
export const BEE_MODEL = Object.freeze({ scale: 0.75, centre: [0, 0.75, 0] });
// Hit volume in insect units (ellipsoid centre and radii): body without the
// wings, legs or antennae.
export const BEE_HIT = Object.freeze({ centre: [0, -0.1, 0], radii: [0.45, 0.54, 0.9] });

export const BEE_BONES = Object.freeze({
  root: 'Bone_000',
  thorax: 'Bone_002',
  head: 'Bone_023',
  // Abdomen from the waist to the sting.
  abdomen: ['Bone_006', 'Bone_005', 'Bone_004'],
  wings: ['Bone_026', 'Bone_028'], // +X first
  antennae: [
    ['Bone_036', 'Bone_035', 'Bone_034'],
    ['Bone_032', 'Bone_031', 'Bone_030'],
  ],
  // Hip and knee bones (the tarsus follows the knee), front to rear, +X first.
  legs: [
    ['Bone_040', 'Bone_039'],
    ['Bone_044', 'Bone_043'],
    ['Bone_018', 'Bone_017'],
    ['Bone_022', 'Bone_021'],
    ['Bone_014', 'Bone_013'],
    ['Bone_010', 'Bone_009'],
  ],
});

// Presentation matrix: model metres (feet at y = 0, head +Z) -> game units.
export function presentation(T: Three): THREE.Matrix4 {
  const [x, y, z] = BEE_MODEL.centre;
  const s = BEE_MODEL.scale;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(s, s, s))
    .multiply(new T.Matrix4().makeTranslation(-x, -y, -z));
}

// Bind-pose span of a wing pair (model space): hinge -> farthest vertex, and
// the hinge itself.
const spans = new WeakMap<Three, THREE.Vector3[]>();
export function wingSpan(T: Three, side: number): THREE.Vector3 {
  let list = spans.get(T);
  if (!list) {
    const geometry = BEE.geometry(T);
    const p = geometry.attributes.position.array,
      j = geometry.attributes.skinIndex.array;
    const { bind } = BEE.helpers(T);
    list = BEE_BONES.wings.map((name) => {
      const bone = BEE.boneIndex(name);
      const hinge = bind(name);
      let tip = hinge.clone(),
        best = 0;
      for (let v = 0; v < p.length / 3; v++) {
        if (j[v * 4] !== bone) continue;
        const d = new T.Vector3().fromArray(p, v * 3).distanceToSquared(hinge);
        if (d > best) ((best = d), tip.fromArray(p, v * 3));
      }
      return tip.sub(hinge).normalize();
    });
    spans.set(T, list);
  }
  return list[side];
}

// Model-space rotation deltas of the flight cycle at loop phase t in [0, 1).
export function beeFlightPose(
  T: Three,
  t: number,
  { euler: e }: Pick<CreatureHelpers, 'euler'> = BEE.helpers(T),
): CreaturePose {
  const F = BEE_FLIGHT;
  const beat = TAU * F.beats * t;
  const slow = TAU * t;
  const pose: CreaturePose = {};
  const stroke = Math.cos(beat);
  const elevation = F.wingDown + ((F.wingUp - F.wingDown) * (1 + stroke)) / 2;
  const sweep = F.wingSweep - F.wingSweepRange * Math.sin(beat);
  const twist = -F.wingTwist * Math.sin(beat);
  for (const [k, name] of BEE_BONES.wings.entries()) {
    const s = k ? -1 : 1;
    const direction = new T.Vector3(
      s * Math.cos(elevation) * Math.cos(sweep),
      Math.sin(elevation),
      -Math.cos(elevation) * Math.sin(sweep),
    );
    const turn = new T.Quaternion().setFromUnitVectors(wingSpan(T, k), direction);
    pose[name] = {
      rotation: new T.Quaternion().setFromAxisAngle(direction, s * twist).multiply(turn),
    };
  }
  // Body: a little bob on each downstroke and a slow wobble.
  pose[BEE_BONES.root] = {
    offset: [0, 0.02 * Math.sin(beat - 0.6), 0],
    rotation: e(
      -0.08 + 0.03 * Math.sin(slow),
      0.03 * Math.sin(slow * 2),
      0.04 * Math.sin(slow + 1),
    ),
  };
  // Abdomen hangs under the thorax and pumps twice per loop, the sting curls.
  BEE_BONES.abdomen.forEach((name, k) => {
    pose[name] = {
      rotation: e(-(0.22 + 0.05 * Math.sin(slow * 2 - k * 0.7)) * (k ? 0.5 : 1), 0, 0),
    };
  });
  pose[BEE_BONES.head] = { rotation: e(0.05 * Math.sin(slow * 3), 0.06 * Math.sin(slow), 0) };
  BEE_BONES.antennae.forEach((chain, side) => {
    chain.forEach((name, k) => {
      pose[name] = {
        rotation: e(
          0.08 * Math.sin(slow * 4 + side * 1.3 - k * 0.6),
          0.1 * Math.sin(slow * 2 + side * Math.PI - k * 0.5),
          0,
        ),
      };
    });
  });
  // Legs hang under the body, trailing back, and paddle slowly.
  BEE_BONES.legs.forEach(([hip, knee], k) => {
    const s = k % 2 ? -1 : 1;
    const pair = Math.floor(k / 2);
    const swing = 0.08 * Math.sin(slow * 2 - pair * 0.9 + (s > 0 ? 0 : 0.6));
    pose[hip] = { rotation: e(-0.5 - pair * 0.1 + swing, 0, -s * 0.2, 'ZXY') };
    pose[knee] = { rotation: e(-0.4 + swing * 0.5, 0, s * 0.2, 'ZXY') };
  });
  return pose;
}

export const BEE = defineCreature(D, {
  name: 'abeille',
  presentation,
  pose: beeFlightPose,
  rest: 0.3 / BEE_FLIGHT.beats,
  frames: BEE_FLIGHT.frames,
});
export const BEE_SOURCE = D.source;
