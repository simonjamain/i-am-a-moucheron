// Panner and listener helpers. Positions are read without any Three.js runtime:
// an Object3D is recognised by `isObject3D` and read from its world matrix.
import type { Object3D } from 'three';
import type { DistanceOptions, ListenerPose, SoundPosition, Vec3Like } from './types.ts';

export interface MutableVec3 {
  x: number;
  y: number;
  z: number;
}

/** Smoothing time constant of position changes, in seconds. */
export const POSITION_SMOOTHING = 0.02;

export const isObject3D = (value: unknown): value is Object3D =>
  !!value && (value as { isObject3D?: unknown }).isObject3D === true;

/** Stored form of a position: points are copied, followers stay references. */
export type TrackedPosition = Object3D | MutableVec3 | (() => Vec3Like);

export function trackPosition(position: SoundPosition): TrackedPosition {
  if (typeof position === 'function' || isObject3D(position)) return position;
  const p = position as Vec3Like;
  return { x: p.x, y: p.y, z: p.z };
}

/** Writes the current world position into `out`; false if it is not finite. */
export function readPosition(position: TrackedPosition, out: MutableVec3): boolean {
  let x: number, y: number, z: number;
  if (typeof position === 'function') ({ x, y, z } = position());
  else if (isObject3D(position)) {
    const e = position.matrixWorld.elements;
    x = e[12];
    y = e[13];
    z = e[14];
  } else ({ x, y, z } = position);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  out.x = x;
  out.y = y;
  out.z = z;
  return true;
}

const unit = (x: number, y: number, z: number): MutableVec3 => {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
};

/** Pose of an Object3D: Three.js objects look along their local -Z axis. */
export function poseOf(listener: Object3D | (() => ListenerPose | null)): ListenerPose | null {
  if (typeof listener === 'function') return listener();
  const e = listener.matrixWorld.elements;
  return {
    position: { x: e[12], y: e[13], z: e[14] },
    forward: unit(-e[8], -e[9], -e[10]),
    up: unit(e[4], e[5], e[6]),
  };
}

type LegacyListener = AudioListener & {
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
};

function setParam(param: AudioParam, value: number, now: number, immediate: boolean) {
  if (immediate) param.setValueAtTime(value, now);
  else param.setTargetAtTime(value, now, POSITION_SMOOTHING);
}

/** Moves the context listener; falls back to setPosition where AudioParams are missing. */
export function applyListener(ctx: BaseAudioContext, pose: ListenerPose, immediate: boolean): void {
  const l = ctx.listener as LegacyListener,
    now = ctx.currentTime,
    { position: p, forward: f, up: u } = pose;
  if (l.positionX) {
    setParam(l.positionX, p.x, now, immediate);
    setParam(l.positionY, p.y, now, immediate);
    setParam(l.positionZ, p.z, now, immediate);
    setParam(l.forwardX, f.x, now, immediate);
    setParam(l.forwardY, f.y, now, immediate);
    setParam(l.forwardZ, f.z, now, immediate);
    setParam(l.upX, u.x, now, immediate);
    setParam(l.upY, u.y, now, immediate);
    setParam(l.upZ, u.z, now, immediate);
  } else {
    l.setPosition?.(p.x, p.y, p.z);
    l.setOrientation?.(f.x, f.y, f.z, u.x, u.y, u.z);
  }
}

export function createPanner(
  ctx: BaseAudioContext,
  hrtf: boolean,
  distance: DistanceOptions,
): PannerNode {
  const panner = ctx.createPanner();
  panner.panningModel = hrtf ? 'HRTF' : 'equalpower';
  if (distance.model) panner.distanceModel = distance.model;
  if (distance.ref !== undefined) panner.refDistance = distance.ref;
  if (distance.max !== undefined) panner.maxDistance = distance.max;
  if (distance.rolloff !== undefined) panner.rolloffFactor = distance.rolloff;
  return panner;
}

type LegacyPanner = PannerNode & { setPosition?: (x: number, y: number, z: number) => void };

export function placePanner(
  panner: PannerNode,
  p: Vec3Like,
  now: number,
  immediate: boolean,
): void {
  if (panner.positionX) {
    setParam(panner.positionX, p.x, now, immediate);
    setParam(panner.positionY, p.y, now, immediate);
    setParam(panner.positionZ, p.z, now, immediate);
  } else (panner as LegacyPanner).setPosition?.(p.x, p.y, p.z);
}
