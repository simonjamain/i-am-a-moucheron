// The purgatory's VIP lane guard: user-supplied Meshy "Guardian in Black" with
// its 48-bone SmartRig and no clip (scripts/import-creature.py vip-guard). He
// stands at the rope gate: a slow breath lifts his chest and shoulders, and
// every few seconds he looks along the queue then back. The model faces +Z,
// feet at y = 0 (model metres).
import { VIP_GUARD_DATA as D } from './vip-guard-data.ts';
import { defineCreature, TAU } from './rigged-creature.ts';
import type { CreaturePose, CreatureHelpers } from './rigged-creature.ts';
import { WALK_WORLDS } from './scale.ts';
import type { Three } from './types.ts';

export const VIP_GUARD_MODEL = Object.freeze({
  /** Drawn height in metres: a head taller than the 1.8 m souls. */
  height: 1.95,
  /** Model height (metres, bind pose). */
  modelHeight: 1.7,
  /** One loop of the idle (seconds): three breaths and one look around. */
  cycle: 12,
  breaths: 3,
});
export const VIP_GUARD_BONES = Object.freeze({
  hips: 'Bone_000',
  spine: 'Bone_005',
  chest: 'Bone_004',
  neck: 'Bone_029',
  head: 'Bone_028',
  shoulders: ['Bone_021', 'Bone_026'],
});

/** Idle at loop phase t in [0, 1): breath and a look to each side. */
export function guardIdlePose(T: Three, t: number, h: CreatureHelpers): CreaturePose {
  const breath = Math.sin(TAU * VIP_GUARD_MODEL.breaths * t);
  // Look: hold straight, turn to one side, hold, back, the other side.
  const look = Math.sin(TAU * t) * Math.min(1, Math.abs(Math.sin(TAU * t)) * 2.2);
  const B = VIP_GUARD_BONES;
  void h;
  const e = (x: number, y: number, z: number) =>
    new T.Quaternion().setFromEuler(new T.Euler(x, y, z));
  return {
    [B.spine]: { rotation: e(-0.012 * breath, 0, 0) },
    [B.chest]: { rotation: e(-0.022 * breath, 0.04 * look, 0), offset: [0, 0.004 * breath, 0] },
    [B.neck]: { rotation: e(0.01 * breath, 0.12 * look, 0) },
    [B.head]: { rotation: e(0, 0.34 * look, 0) },
    [B.shoulders[0]]: { rotation: e(0, 0, 0.018 * breath) },
    [B.shoulders[1]]: { rotation: e(0, 0, -0.018 * breath) },
  };
}

export const VIP_GUARD = defineCreature(D, {
  name: 'vigile-vip',
  // Model metres to purgatory scene units, at the guard's drawn height.
  presentation: (T) =>
    new T.Matrix4().makeScale(
      ...(Array(3).fill(
        (VIP_GUARD_MODEL.height / VIP_GUARD_MODEL.modelHeight) * WALK_WORLDS.purgatory.sceneScale,
      ) as [number, number, number]),
    ),
  pose: guardIdlePose,
  rest: 0,
  frames: 1,
});
