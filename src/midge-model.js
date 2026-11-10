import { MIDGE_DATA as D } from './midge-data.js';
import { defineCreature, TAU } from './rigged-creature.js';

// Midge enemy: user-supplied Meshy "Angry Little Fly" with its SmartRig skeleton
// plus two wing bones added at import. The GLB has no clip: the flight cycle
// below poses the bones procedurally (wing beat, body bob, dangling legs,
// abdomen and antennae). Swarms reach thousands of midges, so the cycle is
// skinned once on the CPU into a vertex animation texture that a single
// InstancedMesh samples per instance phase (src/creature-batch.js).

// One loop holds an integer number of wing beats so every secondary motion
// loops with it. FRAMES_PER_BEAT samples are interpolated linearly in the shader.
export const MIDGE_FLIGHT = Object.freeze({
  loop: 1, // seconds
  beats: 7, // wing beats per loop (7 Hz)
  framesPerBeat: 12,
  frames: 84,
  // Wing elevation (rad, above horizontal) at the top and bottom of the stroke.
  wingUp: 0.95,
  wingDown: -0.2,
  // Angle behind the lateral axis (rad): mean and half range over a stroke.
  wingSweep: 0.55,
  wingSweepRange: 0.3,
  wingTwist: 0.4,
});
// Presentation in the game's midge units: head towards -Z (client heading),
// thorax at the origin, body length about 1.9 units (old procedural midge: 1.55).
export const MIDGE_MODEL = Object.freeze({ scale: 0.8, centre: [0, 0.82, 0.05] });

export const MIDGE_BONES = Object.freeze({
  root: 'Bone_000',
  abdomen: ['Bone_007', 'Bone_006', 'Bone_005'],
  head: 'Bone_017',
  antennae: [
    ['Bone_033', 'Bone_032', 'Bone_031'],
    ['Bone_037', 'Bone_036', 'Bone_035'],
  ],
  // Upper leg bones, front to rear; second bone is the knee.
  legs: [
    ['Bone_026', 'Bone_025'],
    ['Bone_029', 'Bone_028'],
    ['Bone_020', 'Bone_019'],
    ['Bone_023', 'Bone_022'],
    ['Bone_012', 'Bone_011'],
    ['Bone_015', 'Bone_014'],
  ],
  wings: ['Wing_L', 'Wing_R'],
});

// Presentation matrix: model metres (feet at y = 0, head +Z) -> game midge units.
export function presentation(T) {
  const [x, y, z] = MIDGE_MODEL.centre;
  return new T.Matrix4()
    .makeRotationY(Math.PI)
    .multiply(new T.Matrix4().makeScale(MIDGE_MODEL.scale, MIDGE_MODEL.scale, MIDGE_MODEL.scale))
    .multiply(new T.Matrix4().makeTranslation(-x, -y, -z));
}

// Bind-pose span of a wing (model space): hinge -> farthest vertex of its shell.
const spans = new WeakMap();
function wingSpan(T, side) {
  let list = spans.get(T);
  if (!list) {
    const geometry = MIDGE.geometry(T);
    const p = geometry.attributes.position.array,
      j = geometry.attributes.skinIndex.array;
    list = MIDGE_BONES.wings.map((name, k) => {
      const bone = MIDGE.boneIndex(name);
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
// The fly faces +Z, Y is up, so +X is its left side.
export function flightPose(T, t, { euler: e } = MIDGE.helpers(T)) {
  const F = MIDGE_FLIGHT;
  const beat = TAU * F.beats * t; // wing stroke angle
  const slow = TAU * t; // one secondary sway per loop
  const pose = {};
  // Stroke: cos = 1 at the top. `sweep` is the angle behind the lateral axis:
  // the wing moves forward during the downstroke (sin > 0) and back on the
  // upstroke, pushing air backwards (forward flight), and pitches (twists
  // about its span) at the turns, so the tip draws a figure of eight.
  const stroke = Math.cos(beat);
  const elevation = F.wingDown + ((F.wingUp - F.wingDown) * (1 + stroke)) / 2;
  const sweep = F.wingSweep - F.wingSweepRange * Math.sin(beat);
  const twist = -F.wingTwist * Math.sin(beat);
  for (const [k, name] of MIDGE_BONES.wings.entries()) {
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
  // Body: rises on each downstroke, slow pitch and roll sway over the loop.
  pose[MIDGE_BONES.root] = {
    offset: [0.02 * Math.sin(slow * 2), 0.035 * Math.sin(beat - 0.6), 0],
    rotation: e(0.06 * Math.sin(slow) - 0.04, 0, 0.07 * Math.sin(slow + 1)),
  };
  // Abdomen: a lagging wave down the three segments.
  MIDGE_BONES.abdomen.forEach((name, k) => {
    pose[name] = { rotation: e(0.08 + 0.07 * Math.sin(slow * 2 - k * 0.7), 0, 0) };
  });
  pose[MIDGE_BONES.head] = { rotation: e(0.05 * Math.sin(slow * 2 + 1), 0.08 * Math.sin(slow), 0) };
  MIDGE_BONES.antennae.forEach((chain, side) => {
    chain.forEach((name, k) => {
      pose[name] = {
        rotation: e(
          0.22 * Math.sin(slow * 3 + side * 1.3 - k * 0.9),
          0,
          0.1 * Math.sin(slow * 4 + side),
        ),
      };
    });
  });
  // Legs: folded under the body and trailing back, swinging slightly.
  MIDGE_BONES.legs.forEach(([upper, knee], k) => {
    const s = k % 2 ? -1 : 1; // even = +X (left)
    const pair = Math.floor(k / 2); // 0 front, 2 rear
    const swing = 0.12 * Math.sin(slow * 2 - pair * 0.8 + (s > 0 ? 0 : 0.5));
    pose[upper] = { rotation: e(0.45 + pair * 0.2 + swing, 0, -s * 0.85, 'ZXY') };
    pose[knee] = { rotation: e(0.3 + swing * 0.5, 0, s * 0.35, 'ZXY') };
  });
  return pose;
}

export const MIDGE = defineCreature(D, {
  name: 'moucheron',
  presentation,
  pose: flightPose,
  rest: 0.3 / MIDGE_FLIGHT.beats, // mid-stroke bounds for hit tests
  frames: MIDGE_FLIGHT.frames,
});

// One rigged midge (SkinnedMesh): corpses, previews and non-WebGL fallback.
// `pose(t)` applies the flight cycle at loop phase t.
export function createMidgeRig(T, material) {
  const rig = MIDGE.createRig(T, material);
  // Flight cycle at time `ms` for a midge whose roster phase is in radians.
  rig.animate = (ms, phase = 0) => rig.pose(ms / 1000 / MIDGE_FLIGHT.loop + phase / TAU);
  return rig;
}

export const bakeFlight = (T, frames) => MIDGE.bake(T, frames);
export const midgeTexture = (T) => MIDGE.texture(T);
export const midgeGeometry = (T) => MIDGE.geometry(T);
export const midgeBoneIndex = (name) => MIDGE.boneIndex(name);
export const MIDGE_SOURCE = D.source;
