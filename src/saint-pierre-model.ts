// Saint Pierre at the purgatory's counter: user-supplied Meshy "The Keeper of
// Wisdom" (long white beard, robe, key at the belt) with its 39-bone SmartRig and
// no clip (scripts/import-creature.py saint-pierre). Poses are procedural, in
// model space (src/rigged-creature.ts): a slow breath, the head turned toward the
// soul he serves, a short walk when he moves to the other window, and the right
// arm stamping while he serves an insect. The model faces +Z (the souls), +X is
// his left side; feet at y = 0 (model metres).
import { SAINT_PIERRE_DATA as D } from './saint-pierre-data.js';
import { defineCreature, TAU } from './rigged-creature.ts';
import type { CreaturePose, CreatureRig } from './rigged-creature.ts';
import { WALK_WORLDS } from './scale.ts';
import type { Three } from './types.ts';
import type * as THREE from 'three';

export const SAINT_PIERRE_MODEL = Object.freeze({
  /** Drawn height in metres. */
  height: 1.85,
  /** Model height (metres, bind pose). */
  modelHeight: 1.7,
  /** Breath period (s). */
  breath: 4,
  /** Model metres per walking cycle (two steps). */
  stride: 1.1,
  /** Stamps per second while serving. */
  stamps: 1.4,
});
export const SAINT_PIERRE_BONES = Object.freeze({
  hips: 'Bone_000',
  spine: 'Bone_003',
  chest: 'Bone_002',
  neck: 'Bone_020',
  head: 'Bone_019',
  // Shoulder, upper arm, forearm: left (+X), right (-X).
  arms: [
    ['Bone_025', 'Bone_024', 'Bone_023'],
    ['Bone_030', 'Bone_029', 'Bone_028'],
  ],
  hands: ['Bone_021', 'Bone_026'],
  // Hip, knee: left (+X), right (-X).
  legs: [
    ['Bone_013', 'Bone_012'],
    ['Bone_018', 'Bone_017'],
  ],
});

/** What Saint Pierre is doing (set before each pose). */
export interface SaintMotion {
  /** Seconds, for the breath. */
  time: number;
  /** 0 standing, 1 walking; `step` is the walking phase in cycles. */
  walk: number;
  step: number;
  /** Head turn (radians, positive toward his left, +X). */
  look: number;
  /** 0 idle, 1 stamping; `stamp` is the stamping phase in cycles. */
  stamping: number;
  stamp: number;
}
// The single Saint Pierre's motion: defineCreature's pose only takes a phase,
// so the rest of his state is read here (there is one Saint Pierre per scene).
const motion: SaintMotion = { time: 0, walk: 0, step: 0, look: 0, stamping: 0, stamp: 0 };

export function saintPose(T: Three, _t: number): CreaturePose {
  const B = SAINT_PIERRE_BONES;
  const e = (x: number, y: number, z: number) =>
    new T.Quaternion().setFromEuler(new T.Euler(x, y, z));
  const breath = Math.sin((TAU * motion.time) / SAINT_PIERRE_MODEL.breath);
  const swing = Math.sin(TAU * motion.step) * motion.walk;
  const lift = Math.max(0, Math.sin(TAU * motion.step)) * motion.walk,
    liftOther = Math.max(0, -Math.sin(TAU * motion.step)) * motion.walk;
  // Stamp: raise the arm forward (0 to 0.6 of the cycle), then bring it down fast.
  const c = motion.stamp % 1;
  const raise =
    (c < 0.6 ? Math.sin((c / 0.6) * (Math.PI / 2)) : 1 - (c - 0.6) / 0.4) * motion.stamping;
  const pose: CreaturePose = {
    [B.hips]: { offset: [0, -0.015 * Math.abs(swing), 0] },
    [B.spine]: { rotation: e(-0.01 * breath, 0, 0.03 * swing) },
    [B.chest]: { rotation: e(-0.018 * breath + 0.06 * motion.stamping, 0.2 * motion.look, 0) },
    [B.neck]: { rotation: e(0.008 * breath, 0.3 * motion.look, 0) },
    [B.head]: { rotation: e(0.15 * motion.stamping, 0.5 * motion.look, 0) },
  };
  // Legs: forward is a negative rotation about X (feet point down, model faces +Z).
  B.legs.forEach(([hip, knee], i) => {
    const s = i ? -swing : swing,
      up = i ? liftOther : lift;
    pose[hip] = { rotation: e(-0.38 * s - 0.25 * up, 0, 0) };
    pose[knee] = { rotation: e(0.55 * up, 0, 0) };
  });
  // Arms swing against the legs; the right arm stamps.
  B.arms.forEach(([shoulder, upper, fore], i) => {
    const s = i ? swing : -swing;
    if (i === 1 && motion.stamping > 0) {
      pose[upper] = { rotation: e(-1.25 * raise, 0, -0.15 * raise) };
      pose[fore] = { rotation: e(-0.5 * raise, 0, 0) };
    } else pose[upper] = { rotation: e(-0.25 * s, 0, 0) };
    pose[shoulder] = { rotation: e(0, 0, (i ? 0.012 : -0.012) * breath) };
  });
  return pose;
}

export const SAINT_PIERRE = defineCreature(D, {
  name: 'saint-pierre',
  // Model metres to purgatory scene units, at his drawn height.
  presentation: (T) =>
    new T.Matrix4().makeScale(
      ...(Array(3).fill(
        (SAINT_PIERRE_MODEL.height / SAINT_PIERRE_MODEL.modelHeight) *
          WALK_WORLDS.purgatory.sceneScale,
      ) as [number, number, number]),
    ),
  pose: saintPose,
  rest: 0,
  frames: 1,
});

/** Scene units per model metre, at his drawn height. */
const SCALE =
  (SAINT_PIERRE_MODEL.height / SAINT_PIERRE_MODEL.modelHeight) * WALK_WORLDS.purgatory.sceneScale;

export interface SaintState {
  /** Horizontal speed (scene units/s). */
  speed: number;
  /** Head turn toward the soul served (radians), 0 straight ahead. */
  look: number;
  stamping: boolean;
}
/** The posed Saint Pierre of a scene. */
export class SaintPierre {
  readonly rig: CreatureRig;
  readonly container: THREE.Group;
  private readonly motion = { walk: 0, step: 0, look: 0, stamping: 0, stamp: 0 };
  constructor(T: Three) {
    this.rig = SAINT_PIERRE.createRig(T);
    this.container = this.rig.container;
    this.rig.mesh.castShadow = true;
  }
  /** Advance his motion by dt seconds and pose him. */
  update(dt: number, time: number, state: SaintState): void {
    const m = this.motion,
      k = 1 - Math.exp(-8 * Math.max(0, dt));
    const walking = state.speed > 0.15 ? 1 : 0;
    m.walk += (walking - m.walk) * k;
    // Steps follow the distance covered (no foot sliding).
    m.step += (state.speed * dt) / (SAINT_PIERRE_MODEL.stride * SCALE * this.container.scale.x);
    m.look += (Math.max(-0.9, Math.min(0.9, state.look)) - m.look) * k;
    m.stamping += ((state.stamping && !walking ? 1 : 0) - m.stamping) * k;
    if (m.stamping > 0.01) m.stamp += dt * SAINT_PIERRE_MODEL.stamps;
    Object.assign(motion, m, { time });
    this.rig.pose(0);
  }
}
