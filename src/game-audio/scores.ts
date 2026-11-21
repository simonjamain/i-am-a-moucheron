// Voice priority policy of the game: importance × level × distance attenuation,
// so the loudest important sounds keep a voice when combat saturates audio.
import type { SoundKind } from './synth.ts';

/** Importance per sound: interface feedback first, ambience last. */
export const SOUND_PRIORITY: Readonly<Record<SoundKind, number>> = {
  alarm: 9,
  clear: 9,
  defeat: 9,
  dollar: 9,
  tick: 9,
  board: 8,
  exit: 8,
  confirm: 8,
  wave: 8,
  spawn: 7,
  crash: 6,
  dive: 5,
  fall: 5,
  flak: 5,
  engine: 4,
  impact: 4,
  ko: 4,
  punch: 4,
  shot: 4,
  gatling: 4,
  block: 3,
  dash: 3,
  insect: 3,
  ricochet: 3,
  stamp: 3,
  paper: 2,
  step: 1,
  ambience: 1,
};

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Gain of the inverse distance model used by the game's panners (0 to 1). */
export function inverseGain(distance: number, ref: number, rolloff: number, max: number): number {
  if (!(ref > 0)) return 1;
  const d = Math.min(Math.max(distance, ref), Math.max(ref, max));
  return ref / (ref + rolloff * (d - ref));
}

/** Score of a sound heard from `listener`: priority × level × attenuation. */
export function soundScore(
  kind: SoundKind,
  source: Point,
  listener: Point,
  distance: { ref: number; rolloff: number; max: number },
  level = 1,
  boost = 1,
): number {
  const d = Math.hypot(source.x - listener.x, source.y - listener.y, source.z - listener.z);
  if (!Number.isFinite(d)) return 0;
  return (
    SOUND_PRIORITY[kind] *
    Math.max(0, level) *
    boost *
    inverseGain(d, distance.ref, distance.rolloff, distance.max)
  );
}
