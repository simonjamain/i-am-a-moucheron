// The game's sound catalogue for the audio library: synthesised buffers,
// one-shots at their profile level, loops driven by { rate, level } params.
import type { SoundDef, SoundOutput } from '../audio/index.ts';
import { AUDIO_PROFILES, synthesize, type SoundKind } from './synth.ts';

export const LOOP_KINDS = ['ambience', 'engine', 'dive', 'insect', 'gatling'] as const;
export type LoopKind = (typeof LOOP_KINDS)[number];
export type OneShotKind = Exclude<SoundKind, LoopKind>;

/** Live parameters of a loop: playback rate and gain multiplier. */
export interface LoopParams {
  rate: number;
  level: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// One buffer per sound and per context, synthesised on first use.
const buffers = new WeakMap<BaseAudioContext, Map<SoundKind, AudioBuffer>>();
export function synthBuffer(ctx: BaseAudioContext, kind: SoundKind): AudioBuffer {
  let cache = buffers.get(ctx);
  if (!cache) buffers.set(ctx, (cache = new Map()));
  let buffer = cache.get(kind);
  if (!buffer) {
    const samples = synthesize(kind, ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    cache.set(kind, buffer);
  }
  return buffer;
}

function oneShot(kind: OneShotKind): SoundDef<void> {
  return {
    volume: AUDIO_PROFILES[kind].level,
    create(ctx): SoundOutput<void> {
      const source = ctx.createBufferSource();
      source.buffer = synthBuffer(ctx, kind);
      return { output: source, sources: [source] };
    },
  };
}

function loop(kind: LoopKind): SoundDef<LoopParams> {
  return {
    volume: AUDIO_PROFILES[kind].level,
    loop: true,
    create(ctx): SoundOutput<LoopParams> {
      const source = ctx.createBufferSource(),
        level = ctx.createGain();
      source.buffer = synthBuffer(ctx, kind);
      source.connect(level);
      let first = true;
      return {
        output: level,
        sources: [source],
        update({ rate, level: gain }) {
          const now = ctx.currentTime,
            r = clamp(Number(rate) || 1, 0.35, 3),
            g = Math.max(0, Number(gain) || 0);
          if (first) {
            source.playbackRate.setValueAtTime(r, now);
            level.gain.setValueAtTime(g, now);
            first = false;
          } else {
            source.playbackRate.setTargetAtTime(r, now, 0.08);
            level.gain.setTargetAtTime(g, now, 0.05);
          }
        },
      };
    },
  };
}

export type GameCatalog = { [K in OneShotKind]: SoundDef<void> } & {
  [K in LoopKind]: SoundDef<LoopParams>;
};

export const isLoopKind = (kind: string): kind is LoopKind =>
  (LOOP_KINDS as readonly string[]).includes(kind);

export const GAME_CATALOG = Object.fromEntries(
  (Object.keys(AUDIO_PROFILES) as SoundKind[]).map((kind) => [
    kind,
    isLoopKind(kind) ? loop(kind) : oneShot(kind),
  ]),
) as GameCatalog;
