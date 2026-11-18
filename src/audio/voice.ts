// One real voice: the sound's own nodes + gain (volume and fades) + optional
// panner, connected to the manager's bus. Started, faded and released here.
import type { AssetStore, DistanceOptions, SoundDef, SoundOutput, Vec3Like } from './types.ts';
import { createPanner, placePanner } from './spatial.ts';

export interface VoiceOptions {
  ctx: BaseAudioContext;
  def: SoundDef<any>;
  assets: AssetStore;
  destination: AudioNode;
  /** Catalogue volume × instance volume. */
  volume: number;
  /** Spatialised voices get a panner placed here at once. */
  position: Vec3Like | null;
  hrtf: boolean;
  distance: DistanceOptions;
  /** Seconds since the logical sound started; loops resume there. */
  elapsed: number;
  /** Seconds of fade-in; 0 starts at full volume. */
  fadeIn: number;
}

type BufferSource = Pick<AudioBufferSourceNode, 'buffer' | 'loop' | 'playbackRate' | 'start'>;

const isBufferSource = (node: AudioScheduledSourceNode): node is AudioBufferSourceNode =>
  'buffer' in node && 'loop' in node && 'playbackRate' in node;

/** Offset where a looping buffer source resumes after `elapsed` seconds. */
export function loopOffset(source: BufferSource, elapsed: number): number {
  const duration = source.buffer?.duration ?? 0;
  if (!(duration > 0) || !(elapsed > 0)) return 0;
  const rate = Math.abs(source.playbackRate.value) || 1;
  return (elapsed * rate) % duration;
}

export class Voice {
  readonly output: SoundOutput<any>;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  readonly ctx: BaseAudioContext;
  readonly startedAt: number;
  /** All sources have ended (or the voice was disposed). */
  finished = false;
  /** Fading out: still counted as a voice until `freeAt`. */
  releasing = false;
  /** Context time after which a releasing voice is freed even without `ended`. */
  freeAt = Infinity;
  private remaining: number;
  private onFinish: (() => void) | null = null;

  constructor(options: VoiceOptions) {
    const { ctx, def, assets, destination, volume, position, hrtf, distance, elapsed, fadeIn } =
      options;
    this.ctx = ctx;
    this.output = def.create(ctx, assets);
    this.gain = ctx.createGain();
    this.panner = position ? createPanner(ctx, hrtf, distance) : null;
    const now = ctx.currentTime;
    this.startedAt = now;
    if (fadeIn > 0) {
      this.gain.gain.setValueAtTime(0, now);
      this.gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
    } else this.gain.gain.value = volume;
    this.output.output.connect(this.gain);
    if (this.panner) {
      placePanner(this.panner, position as Vec3Like, now, true);
      this.gain.connect(this.panner);
      this.panner.connect(destination);
    } else this.gain.connect(destination);
    const sources = this.output.sources;
    this.remaining = sources.length;
    for (const source of sources) {
      source.onended = () => {
        if (--this.remaining <= 0) this.finish();
      };
      if (isBufferSource(source)) {
        if (def.loop) source.loop = true;
        source.start(now, def.loop ? loopOffset(source, elapsed) : 0);
      } else source.start(now);
    }
    if (!sources.length && !def.loop && !(this.output.duration! > 0)) this.finished = true;
  }

  /** Context time at which a one-shot with a known duration is over. */
  get endsAt(): number {
    const d = this.output.duration;
    return d !== undefined && d >= 0 ? this.startedAt + d : Infinity;
  }

  update(params: unknown): void {
    this.output.update?.(params);
  }

  /** Fades out over `fade` seconds, then stops and frees the nodes. */
  release(fade: number, onFreed: () => void): void {
    if (this.finished) {
      onFreed();
      return;
    }
    if (this.releasing) return;
    this.releasing = true;
    this.onFinish = onFreed;
    const now = this.ctx.currentTime,
      g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    this.freeAt = now + fade + 0.1;
    for (const source of this.output.sources)
      try {
        source.stop(now + fade);
      } catch {
        // Already stopped.
      }
  }

  /** Frees the nodes now: used after a release timeout and by dispose. */
  finish(): void {
    if (this.finished && !this.onFinish) return;
    this.finished = true;
    for (const source of this.output.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    for (const node of [this.output.output, this.gain, this.panner, ...this.output.sources])
      try {
        node?.disconnect();
      } catch {
        // Already disconnected.
      }
    const callback = this.onFinish;
    this.onFinish = null;
    callback?.();
  }
}
