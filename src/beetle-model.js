import { BEETLE_DATA as D } from './beetle-data.js';
import { defineCreature, TAU } from './rigged-creature.js';

// Armoured beetle (`brute`): user-supplied Meshy "Low Poly Cockroach" (a blue
// and orange beetle) with its 48-bone SmartRig plus two hind-wing bones added at
// import (scripts/import-beetle.py). The GLB has no clip: the flight cycle below
// poses the bones procedurally. Like a flower chafer, it flies with its elytra
// closed (they belong to the body shell) and beats the hind wings that stick
// out from under them; the six legs hang below the body. The model faces +Z,
// Y is up, so +X is its left side.

// One loop holds an integer number of wing beats so every secondary motion
// loops with it; the shared clock drives it (src/creature-batch.js).
export const BEETLE_FLIGHT = Object.freeze({
  loop: 1, // seconds
  beats: 6, // wing beats per loop (6 Hz: slower and heavier than the midge)
  framesPerBeat: 10,
  frames: 60,
  // Wing elevation (rad, above horizontal) at the top and bottom of the stroke.
  wingUp: 0.8,
  wingDown: -0.25,
  // Angle behind the lateral axis (rad): mean and half range over a stroke.
  wingSweep: 0.12,
  wingSweepRange: 0.28,
  wingTwist: 0.35,
});
// Presentation in game insect units: head towards -Z (client heading), body
// centre at the origin, about 2.2 units long and 2.9 wide wings included.
export const BEETLE_MODEL = Object.freeze({ scale: 0.75, centre: [0, 0.9, 0] });
// Hit volume in insect units: a perfect sphere on the body centre (equal radii
// make the hit tests use the cheap ray/sphere path), as large as the old
// carapace ellipsoid (same volume) without the wings or the legs.
export const BEETLE_HIT = Object.freeze({ centre: [0, 0, 0], radii: [0.86, 0.86, 0.86] });

export const BEETLE_BONES = Object.freeze({
  root: 'Bone_000',
  wings: ['Wing_L', 'Wing_R'],
  // Hip and knee bones (the tarsus follows the knee), front to rear, +X first.
  legs: [
    ['Bone_042', 'Bone_041'],
    ['Bone_038', 'Bone_037'],
    ['Bone_032', 'Bone_031'],
    ['Bone_028', 'Bone_027'],
    ['Bone_010', 'Bone_009'],
    ['Bone_006', 'Bone_005'],
  ],
});

// Presentation matrix: model metres (feet at y = 0, head +Z) -> game units.
export function presentation(T) {
  const [x, y, z] = BEETLE_MODEL.centre;
  const s = BEETLE_MODEL.scale;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(s, s, s))
    .multiply(new T.Matrix4().makeTranslation(-x, -y, -z));
}

// Bind-pose span of a hind wing (model space): hinge -> farthest vertex.
const spans = new WeakMap();
export function wingSpan(T, side) {
  let list = spans.get(T);
  if (!list) {
    const geometry = BEETLE.geometry(T);
    const p = geometry.attributes.position.array,
      j = geometry.attributes.skinIndex.array;
    list = BEETLE_BONES.wings.map((name, k) => {
      const bone = BEETLE.boneIndex(name);
      const hinge = new T.Vector3().fromArray(D.source.addedWingBones[k].hinge);
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
export function beetleFlightPose(T, t, { euler: e } = BEETLE.helpers(T)) {
  const F = BEETLE_FLIGHT;
  const beat = TAU * F.beats * t; // wing stroke angle
  const slow = TAU * t; // one secondary sway per loop
  const pose = {};
  // Stroke: cos = 1 at the top. The wing moves forward on the downstroke
  // (sin > 0) and back on the upstroke, and twists about its span at the turns.
  const stroke = Math.cos(beat);
  const elevation = F.wingDown + ((F.wingUp - F.wingDown) * (1 + stroke)) / 2;
  const sweep = F.wingSweep - F.wingSweepRange * Math.sin(beat);
  const twist = -F.wingTwist * Math.sin(beat);
  for (const [k, name] of BEETLE_BONES.wings.entries()) {
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
  // Heavy body: nose slightly up, a small lift on each downstroke, slow roll.
  pose[BEETLE_BONES.root] = {
    offset: [0, 0.025 * Math.sin(beat - 0.6), 0],
    rotation: e(-0.12 + 0.03 * Math.sin(slow), 0, 0.05 * Math.sin(slow + 1)),
  };
  // Legs hang under the body, trailing back, and paddle slowly.
  BEETLE_BONES.legs.forEach(([hip, knee], k) => {
    const s = k % 2 ? -1 : 1; // even = +X (left)
    const pair = Math.floor(k / 2); // 0 front, 2 rear
    const swing = 0.1 * Math.sin(slow * 2 - pair * 0.9 + (s > 0 ? 0 : 0.6));
    pose[hip] = { rotation: e(0.75 + pair * 0.1 + swing, 0, -s * 0.5, 'ZXY') };
    pose[knee] = { rotation: e(0.55 + swing * 0.5, 0, s * 0.3, 'ZXY') };
  });
  return pose;
}

export const BEETLE = defineCreature(D, {
  name: 'scarabee',
  presentation,
  pose: beetleFlightPose,
  rest: 0.3 / BEETLE_FLIGHT.beats, // mid-stroke bounds for hit tests
  frames: BEETLE_FLIGHT.frames,
});
export const BEETLE_SOURCE = D.source;
