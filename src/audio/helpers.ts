// Generic sound factories. Examples of the `create` contract, not a closed
// list: a game writes its own factories for synthesis or custom chains.
import type { AssetStore, SoundDef, SoundOutput } from './types.ts';

export interface BufferOptions<P> {
  /** Random playbackRate spread: 0.1 → between 0.9 and 1.1. */
  pitchJitter?: number;
  /** Playback rate from the params, applied at every frame. */
  rate?: (params: P) => number;
  /** Gain multiplier from the params, applied at every frame. */
  gain?: (params: P) => number;
  /** Smoothing time constant of rate and gain changes, in seconds. Default 0.05. */
  smoothing?: number;
}

/** A buffer source + gain; `buffer` picks the buffer each time a voice starts. */
export function fromBuffer<P = void>(
  buffer: (ctx: BaseAudioContext, assets: AssetStore) => AudioBuffer | undefined,
  options: BufferOptions<P> = {},
): Pick<SoundDef<P>, 'create'> {
  const { pitchJitter = 0, rate, gain, smoothing = 0.05 } = options;
  return {
    create(ctx, assets): SoundOutput<P> {
      const data = buffer(ctx, assets);
      if (!data) throw Error('buffer not loaded');
      const source = ctx.createBufferSource(),
        level = ctx.createGain();
      source.buffer = data;
      const jitter = pitchJitter ? 1 + (Math.random() * 2 - 1) * pitchJitter : 1;
      source.playbackRate.value = jitter;
      source.connect(level);
      let first = true;
      const set = (param: AudioParam, value: number) => {
        if (!Number.isFinite(value)) return;
        if (first) param.setValueAtTime(value, ctx.currentTime);
        else param.setTargetAtTime(value, ctx.currentTime, smoothing);
      };
      return {
        output: level,
        sources: [source],
        update:
          rate || gain
            ? (params: P) => {
                if (rate) set(source.playbackRate, rate(params) * jitter);
                if (gain) set(level.gain, gain(params));
                first = false;
              }
            : undefined,
      };
    },
  };
}

/** One decoded file, or a random variant among several, preloaded by URL. */
export function fromUrl<P = void>(
  urls: string | readonly string[],
  options: BufferOptions<P> = {},
): Pick<SoundDef<P>, 'create' | 'preload'> {
  const list = typeof urls === 'string' ? [urls] : [...urls];
  return {
    ...fromBuffer<P>(
      (_, assets) => assets.get(list[Math.floor(Math.random() * list.length)]),
      options,
    ),
    preload: list,
  };
}
