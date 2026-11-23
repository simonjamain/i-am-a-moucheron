import { MOSQUITO_DATA as D } from './mosquito-data.js';
import { defineCreature, TAU } from './rigged-creature.ts';
import type { CreatureHelpers, CreaturePose } from './rigged-creature.ts';
import type * as THREE from 'three';
import type { Three } from './types.ts';

// Mosquito: user-supplied Meshy "Low Poly Mosquito" with its 62-bone SmartRig
// (no clip). Weights are cleaned at import (scripts/import-mosquito.py): each
// wing follows its root bone rigidly, the body never leans on a wing or leg
// bone. The flight cycle below poses the bones procedurally: very fast, narrow
// wing beat, abdomen bobbing, the six long legs hanging and trailing, the
// front pair reaching forward. The model faces +Z, Y is up, so +X is its left.

// One loop holds an integer number of wing beats so every secondary motion
// loops with it; the shared clock drives it (src/creature-batch.js).
export const MOSQUITO_FLIGHT = Object.freeze({
  loop: 1, // seconds
  beats: 15, // wing beats per loop: a whine, faster than the bee
  framesPerBeat: 4,
  frames: 60,
  // Wing elevation (rad, above horizontal) at the top and bottom of the stroke.
  wingUp: 0.75,
  wingDown: -0.2,
  // Angle behind the lateral axis (rad): mean and half range over a stroke.
  wingSweep: 0.55,
  wingSweepRange: 0.35,
  wingTwist: 0.35,
});
// Presentation in game insect units: head towards -Z (client heading), body
// thorax at the origin, about 3.6 units long proboscis included, 3.4 wide: the
// species factor is small, this keeps the silhouette readable (6 x 2 px at 2 m).
export const MOSQUITO_MODEL = Object.freeze({ scale: 1, centre: [0, 0.98, 0] });
// Hit volume in insect units (ellipsoid centre and radii): body without the
// wings, legs or proboscis.
export const MOSQUITO_HIT = Object.freeze({ centre: [0, 0, 0.48], radii: [0.46, 0.4, 1.42] });

export const MOSQUITO_BONES = Object.freeze({
  root: 'Bone_000',
  thorax: 'Bone_001',
  head: 'Bone_003',
  // Abdomen from the waist to the tip.
  abdomen: ['Bone_007', 'Bone_006', 'Bone_005'],
  wings: ['Bone_034', 'Bone_037'], // +X first
  // Femur and tibia bones (the tarsus follows the tibia), front to rear, +X first.
  legs: [
    ['Bone_012', 'Bone_011'],
    ['Bone_018', 'Bone_017'],
    ['Bone_030', 'Bone_029'],
    ['Bone_024', 'Bone_023'],
    ['Bone_042', 'Bone_041'],
    ['Bone_048', 'Bone_047'],
  ],
});

// Presentation matrix: model metres (feet at y = 0, head +Z) -> game units.
export function presentation(T: Three): THREE.Matrix4 {
  const [x, y, z] = MOSQUITO_MODEL.centre;
  const s = MOSQUITO_MODEL.scale;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(s, s, s))
    .multiply(new T.Matrix4().makeTranslation(-x, -y, -z));
}

// Bind-pose span of a wing (model space): hinge -> farthest vertex.
const spans = new WeakMap<Three, THREE.Vector3[]>();
export function wingSpan(T: Three, side: number): THREE.Vector3 {
  let list = spans.get(T);
  if (!list) {
    const geometry = MOSQUITO.geometry(T);
    const p = geometry.attributes.position.array,
      j = geometry.attributes.skinIndex.array;
    const { bind } = MOSQUITO.helpers(T);
    list = MOSQUITO_BONES.wings.map((name) => {
      const bone = MOSQUITO.boneIndex(name);
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
export function mosquitoFlightPose(
  T: Three,
  t: number,
  { euler: e }: Pick<CreatureHelpers, 'euler'> = MOSQUITO.helpers(T),
): CreaturePose {
  const F = MOSQUITO_FLIGHT;
  const beat = TAU * F.beats * t;
  const slow = TAU * t;
  const pose: CreaturePose = {};
  const stroke = Math.cos(beat);
  const elevation = F.wingDown + ((F.wingUp - F.wingDown) * (1 + stroke)) / 2;
  const sweep = F.wingSweep - F.wingSweepRange * Math.sin(beat);
  const twist = -F.wingTwist * Math.sin(beat);
  for (const [k, name] of MOSQUITO_BONES.wings.entries()) {
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
  // Light body: a small bob on each downstroke, slow sway.
  pose[MOSQUITO_BONES.root] = {
    offset: [0, 0.015 * Math.sin(beat - 0.6), 0],
    rotation: e(
      -0.05 + 0.03 * Math.sin(slow),
      0.03 * Math.sin(slow * 2),
      0.04 * Math.sin(slow + 1),
    ),
  };
  // Abdomen bobs up and down twice per loop.
  MOSQUITO_BONES.abdomen.forEach((name, k) => {
    pose[name] = { rotation: e(-0.06 * Math.sin(slow * 2 - k * 0.6), 0, 0) };
  });
  pose[MOSQUITO_BONES.head] = { rotation: e(0.04 * Math.sin(slow * 3), 0.05 * Math.sin(slow), 0) };
  // Long legs hang below the body: the femurs drop, the rear pairs trail back,
  // the front pair reaches forward; all sway slowly.
  MOSQUITO_BONES.legs.forEach(([femur, tibia], k) => {
    const s = k % 2 ? -1 : 1; // even = +X (left)
    const pair = Math.floor(k / 2); // 0 front, 2 rear
    const swing = 0.08 * Math.sin(slow * 2 - pair * 0.9 + (s > 0 ? 0 : 0.6));
    const trail = [-0.35, 0.25, 0.55][pair];
    pose[femur] = { rotation: e(trail + swing, 0, -s * 0.55, 'ZXY') };
    pose[tibia] = { rotation: e(0.2 + swing * 0.5, 0, s * 0.15, 'ZXY') };
  });
  return pose;
}

export const MOSQUITO = defineCreature(D, {
  name: 'moustique',
  presentation,
  pose: mosquitoFlightPose,
  // Mid-stroke, wings level: widest silhouette for bounds and hit tests.
  rest: 0.35 / MOSQUITO_FLIGHT.beats,
  frames: MOSQUITO_FLIGHT.frames,
});
