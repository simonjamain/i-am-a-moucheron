import { WALKER_FREEFALL_SPEED, WALKER_JUMP_SPEED } from './field-physics.ts';

/**
 * Poses of the character in the air, as bone directions in the character's own frame (x: its
 * left, y: up, z: forward; `side` is +1 for the left limbs, -1 for the right). The skeleton is
 * posed procedurally, so these are the whole animation: a jump is three keyframes blended by the
 * vertical speed (`rise`), a free fall is the skydiver's face-down "box", and the canopy hangs
 * the arms up. See docs/walking-network.md.
 */
export type Dir = readonly [number, number, number];
export interface AirPose {
  arm: Dir;
  fore: Dir;
  upLeg: Dir;
  leg: Dir;
}
const pose = (arm: Dir, fore: Dir, upLeg: Dir, leg: Dir): AirPose => ({ arm, fore, upLeg, leg });
// Left side values; the right side mirrors x.
// Take-off: legs push straight, arms swing up.
const LAUNCH = pose([0.25, 0.95, 0.35], [0.2, 1, 0.3], [0.08, -1, 0.05], [0, -1, -0.05]);
// Rising: arms still up and forward, knees starting to bend.
const RISING = pose([0.5, 0.7, 0.45], [0.4, 0.6, 0.8], [0.1, -0.8, 0.5], [0, -1, -0.25]);
// Apex: knees tucked up, arms forward for balance.
const APEX = pose([0.8, 0.35, 0.45], [0.65, 0.25, 0.75], [0.12, -0.55, 0.85], [0.02, -1, -0.45]);
// Coming down: legs straighten and reach for the ground, arms out.
const REACH = pose([0.7, -0.5, 0.3], [0.55, -0.7, 0.55], [0.18, -1, 0.4], [0.04, -1, 0.2]);
// Free fall, body face down (the character leans to the horizontal): arms out with the forearms
// toward the head, legs back and spread.
const BOX = pose([1, 0.15, -0.05], [0.45, 0.2, 0.95], [0.45, 0.05, -1], [0.35, 0.2, -1]);
// Under the canopy: arms up, legs together and slightly forward.
const HANG = pose([0.3, 0.8, 0], [0.12, 1, 0], [0.12, -1, 0.3], [0, -1, 0.1]);

const mix = (a: Dir, b: Dir, t: number): Dir => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const between = (a: AirPose, b: AirPose, t: number): AirPose => ({
  arm: mix(a.arm, b.arm, t),
  fore: mix(a.fore, b.fore, t),
  upLeg: mix(a.upLeg, b.upLeg, t),
  leg: mix(a.leg, b.leg, t),
});
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The jump's pose from its vertical speed: 1 at take-off, 0 at the apex, -1 coming down. */
export function jumpPose(rise: number): AirPose {
  const r = clamp(rise, -1, 1);
  if (r >= 0.5) return between(RISING, LAUNCH, (r - 0.5) * 2);
  return r >= 0 ? between(APEX, RISING, r * 2) : between(APEX, REACH, -r);
}
/** Pose in the air: the jump, blended toward the free fall (`fall`, 0-1) and the canopy (`hang`, 0-1). */
export function airPose(side: 1 | -1, rise: number, fall: number, hang: number): AirPose {
  const pose = between(between(jumpPose(rise), BOX, clamp(fall, 0, 1)), HANG, clamp(hang, 0, 1));
  const flip = (d: Dir): Dir => [d[0] * side, d[1], d[2]];
  return {
    arm: flip(pose.arm),
    fore: flip(pose.fore),
    upLeg: flip(pose.upLeg),
    leg: flip(pose.leg),
  };
}
/** Vertical speed (reference m/s, up positive) → the jump's `rise` (1 at take-off speed). */
export const riseOf = (vy: number): number => clamp(vy / WALKER_JUMP_SPEED, -1.2, 1);
/** True when the fall is fast enough for the free-fall pose (a jump's descent is not). */
export const isFreeFall = (vy: number): boolean => vy < -WALKER_FREEFALL_SPEED;
/** How far the body leans toward horizontal in free fall (radians). */
export const FREE_FALL_LEAN = 1.4;
