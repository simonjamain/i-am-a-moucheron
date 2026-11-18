// createAudioManager: logical sounds, scored every tick, of which only the best
// `maxVoices` own Web Audio nodes. See docs/audio.md for the contract.
import type {
  AssetStore,
  AudioManager,
  AudioManagerConfig,
  AudioStats,
  Catalog,
  ContextState,
  PlayOptions,
  SoundDef,
  SoundState,
  Stop,
} from './types.ts';
import { schedule, type Candidate } from './scheduler.ts';
import { Voice } from './voice.ts';
import {
  applyListener,
  isObject3D,
  placePanner,
  poseOf,
  readPosition,
  trackPosition,
  type MutableVec3,
  type TrackedPosition,
} from './spatial.ts';
import { defaultTimers, frameLoop } from './clock.ts';

/** A one-shot still playing after this many seconds is reported once. */
const LONG_ONE_SHOT = 30;

interface LogicalSound {
  readonly id: number;
  readonly name: string;
  readonly def: SoundDef<any>;
  readonly options: PlayOptions<any>;
  readonly loop: boolean;
  readonly volume: number;
  /** Followed position; null = not spatialised. */
  readonly position: TrackedPosition | null;
  readonly dynamic: boolean;
  readonly last: MutableVec3;
  state: SoundState;
  score: number;
  /** Context time at which the sound logically started; null before a context. */
  start: number | null;
  voice: Voice | null;
  failed: boolean;
}

const noop: Stop = () => {};
const clamp01 = (v: number) => Math.max(0, Math.min(1, Number(v) || 0));

type ContextConstructor = new (options?: AudioContextOptions) => AudioContext;

export function createAudioManager<const C extends Catalog>(
  config: AudioManagerConfig<C>,
): AudioManager<C> {
  const catalog = config.catalog,
    maxVoices = Math.max(0, config.maxVoices ?? 64),
    tickMs = Math.max(1, config.tickMs ?? 100),
    defaultFade = Math.max(0, config.fadeMs ?? 50) / 1000,
    minScore = config.minScore ?? 0,
    useLimiter = config.limiter ?? true,
    timers = config.timers ?? defaultTimers(),
    warn = config.warn ?? ((message: string) => console.warn('[audio] ' + message)),
    load =
      config.load ??
      (async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw Error('HTTP ' + response.status);
        return response.arrayBuffer();
      });

  let ctx: AudioContext | null = null,
    ownsContext = false,
    master: GainNode | null = null,
    limiter: DynamicsCompressorNode | null = null,
    unavailable = false,
    disposed = false,
    volume = clamp01(config.volume ?? 1),
    muted = false,
    nextId = 1,
    tickQueued = false,
    listenerPlaced = false;
  const sounds = new Set<LogicalSound>();
  const releasing = new Set<Voice>();
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string) => {
    if (warned.has(key)) return;
    warned.add(key);
    warn(message);
  };

  // Preloaded buffers, shared by every context this manager opens.
  const buffers = new Map<string, AudioBuffer>();
  const assets: AssetStore = { get: (url) => buffers.get(url) };
  const preloadUrls = [...new Set(Object.values(catalog).flatMap((def) => def.preload ?? []))];
  let preloading = false,
    resolveReady: () => void = () => {};
  const ready = preloadUrls.length
    ? new Promise<void>((resolve) => (resolveReady = resolve))
    : Promise.resolve();
  const loaded = (def: SoundDef<any>) => !def.preload || def.preload.every((u) => buffers.has(u));

  function preload(context: AudioContext) {
    if (preloading || !preloadUrls.length) return;
    preloading = true;
    Promise.all(
      preloadUrls.map(async (url) => {
        try {
          buffers.set(url, await context.decodeAudioData(await load(url)));
        } catch (e) {
          warn('cannot load ' + url + ': ' + ((e as Error)?.message ?? e));
        }
      }),
    ).then(() => {
      resolveReady();
      scheduleTick();
    });
  }

  const running = () => !!ctx && ctx.state === 'running';

  function applyVolume() {
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.025);
  }

  function openContext(): AudioContext | null {
    const source = config.context;
    try {
      if (typeof source === 'function') {
        ctx = source();
        ownsContext = true;
      } else if (source) {
        ctx = source;
        ownsContext = false;
      } else {
        const g = globalThis as typeof globalThis & { webkitAudioContext?: ContextConstructor };
        const Context: ContextConstructor | undefined = g.AudioContext ?? g.webkitAudioContext;
        if (!Context) {
          unavailable = true;
          return null;
        }
        ctx = new Context({ latencyHint: 'interactive' });
        ownsContext = true;
      }
    } catch (e) {
      unavailable = true;
      warn('no audio context: ' + ((e as Error)?.message ?? e));
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    if (useLimiter) {
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      master.connect(limiter);
      limiter.connect(ctx.destination);
    } else master.connect(ctx.destination);
    listenerPlaced = false;
    preload(ctx);
    return ctx;
  }

  function releaseVoice(voice: Voice, fade: number) {
    if (fade > 0 && running()) {
      releasing.add(voice);
      voice.release(fade, () => releasing.delete(voice));
    } else voice.finish();
  }

  function end(sound: LogicalSound, fade: number) {
    if (sound.state === 'ended') return;
    sound.state = 'ended';
    sounds.delete(sound);
    if (sound.voice) releaseVoice(sound.voice, fade);
    sound.voice = null;
    notifyEnded(sound.options, sound.name);
  }

  function notifyEnded(options: PlayOptions<any>, name: string) {
    try {
      options.onEnded?.();
    } catch (e) {
      warn('onEnded of ' + name + ' threw: ' + ((e as Error)?.message ?? e));
    }
  }

  function virtualize(sound: LogicalSound, fade: number) {
    if (sound.voice) releaseVoice(sound.voice, fade);
    sound.voice = null;
    sound.state = 'virtual';
  }

  function readParams(sound: LogicalSound): unknown {
    const params = sound.options.params as unknown;
    return typeof params === 'function' ? (params as () => unknown)() : params;
  }

  function refresh(sound: LogicalSound, immediate: boolean) {
    const voice = sound.voice;
    if (!voice || !ctx) return;
    try {
      if (voice.panner && sound.position && (immediate || sound.dynamic)) {
        if (readPosition(sound.position, sound.last))
          placePanner(voice.panner, sound.last, ctx.currentTime, immediate);
      }
      if (voice.output.update) voice.update(readParams(sound));
    } catch (e) {
      if (!sound.failed) warn('update of ' + sound.name + ' failed: ' + (e as Error)?.message);
      sound.failed = true;
    }
  }

  function promote(sound: LogicalSound, now: number) {
    if (!ctx || !master) return;
    const resuming = sound.state === 'virtual';
    if (sound.position) readPosition(sound.position, sound.last);
    try {
      sound.voice = new Voice({
        ctx,
        def: sound.def,
        assets,
        destination: master,
        volume: sound.volume,
        position: sound.position ? sound.last : null,
        hrtf: sound.options.spatial === 'hrtf',
        distance: { ...sound.def.distance, ...sound.options.distance },
        elapsed: now - (sound.start ?? now),
        fadeIn: resuming ? defaultFade : 0,
      });
    } catch (e) {
      warn('cannot create ' + sound.name + ': ' + ((e as Error)?.message ?? e));
      end(sound, 0);
      return;
    }
    sound.state = 'real';
    refresh(sound, false);
  }

  function score(sound: LogicalSound): number {
    if (!loaded(sound.def)) return -Infinity;
    try {
      const value = sound.options.score();
      return typeof value === 'number' ? value : NaN;
    } catch (e) {
      warnOnce('score:' + sound.id, 'score of ' + sound.name + ' threw: ' + (e as Error)?.message);
      return 0;
    }
  }

  function tick() {
    if (disposed) return;
    const now = ctx?.currentTime ?? 0;
    for (const voice of releasing) if (now >= voice.freeAt) voice.finish();
    for (const sound of sounds) {
      const voice = sound.voice;
      if (!voice) continue;
      if (voice.finished || (!sound.loop && now >= voice.endsAt)) end(sound, 0);
      else if (!sound.loop && now - voice.startedAt > LONG_ONE_SHOT)
        warnOnce(
          'long:' + sound.name,
          'one-shot ' + sound.name + ' still plays after ' + LONG_ONE_SHOT + ' s',
        );
    }
    if (!running()) {
      // No clock to play against: one-shots are dropped, loops wait.
      for (const sound of sounds)
        if (sound.state === 'pending') {
          if (sound.loop) sound.state = 'virtual';
          else end(sound, 0);
        }
      return;
    }
    const candidates: Candidate[] = [];
    for (const sound of sounds) {
      sound.start ??= now;
      sound.score = score(sound);
      candidates.push(sound as Candidate);
    }
    const targets = schedule(candidates, maxVoices, minScore);
    const promoted: LogicalSound[] = [];
    for (const [candidate, target] of targets) {
      const sound = candidate as LogicalSound;
      if (target === 'real') {
        if (sound.state !== 'real') promoted.push(sound);
      } else if (target === 'ended') end(sound, defaultFade);
      else if (sound.state !== 'virtual') virtualize(sound, defaultFade);
    }
    for (const sound of promoted) promote(sound, now);
    if (!timers.requestFrame) frame();
  }

  function scheduleTick() {
    if (tickQueued || disposed) return;
    tickQueued = true;
    queueMicrotask(() => {
      tickQueued = false;
      tick();
    });
  }

  function frame() {
    if (disposed || !ctx || !running()) return;
    if (config.listener) {
      const pose = poseOf(config.listener);
      if (pose) {
        applyListener(ctx, pose, !listenerPlaced);
        listenerPlaced = true;
      }
    }
    for (const sound of sounds) if (sound.voice) refresh(sound, false);
  }

  const interval = timers.setInterval(tick, tickMs);
  const stopFrames = frameLoop(timers, frame);

  const manager: AudioManager<C> = {
    play(name, options) {
      const def = catalog[name] as SoundDef<any> | undefined;
      if (disposed || !def) {
        if (!def) warnOnce('unknown:' + name, 'unknown sound ' + name);
        return noop;
      }
      const loop = !!def.loop;
      if (!loop && (!running() || muted || !loaded(def))) {
        notifyEnded(options as PlayOptions<any>, name);
        return noop;
      }
      const position = options.position ? trackPosition(options.position) : null;
      const sound: LogicalSound = {
        id: nextId++,
        name,
        def,
        options: options as PlayOptions<any>,
        loop,
        volume: clamp01(def.volume ?? 1) * Math.max(0, options.volume ?? 1),
        position,
        dynamic: !!position && (typeof position === 'function' || isObject3D(position)),
        last: { x: 0, y: 0, z: 0 },
        state: 'pending',
        score: 0,
        start: ctx && running() ? ctx.currentTime : null,
        voice: null,
        failed: false,
      };
      sounds.add(sound);
      scheduleTick();
      return (fadeMs?: number) => end(sound, fadeMs === undefined ? defaultFade : fadeMs / 1000);
    },
    async resume() {
      if (disposed) return false;
      if (!ctx && !openContext()) return false;
      const context = ctx!;
      try {
        if (context.state !== 'running' && context.state !== 'closed') await context.resume();
      } catch (e) {
        warn('cannot resume: ' + ((e as Error)?.message ?? e));
      }
      scheduleTick();
      return context.state === 'running';
    },
    async suspend() {
      if (ctx && ctx.state === 'running') await ctx.suspend();
    },
    async close() {
      if (!ctx) return;
      for (const voice of releasing) voice.finish();
      for (const sound of sounds) {
        if (!sound.loop) end(sound, 0);
        else {
          virtualize(sound, 0);
          sound.start = null;
        }
      }
      const context = ctx;
      try {
        master?.disconnect();
        limiter?.disconnect();
      } catch {
        // Already disconnected.
      }
      ctx = master = limiter = null;
      if (ownsContext && context.state !== 'closed')
        try {
          await context.close();
        } catch {
          // Closing twice is harmless.
        }
    },
    get state(): ContextState {
      if (!ctx) return unavailable ? 'unavailable' : 'closed';
      return ctx.state === 'running' ? 'running' : ctx.state === 'closed' ? 'closed' : 'suspended';
    },
    ready,
    setVolume(value) {
      volume = clamp01(value);
      applyVolume();
    },
    setMuted(value) {
      muted = !!value;
      applyVolume();
    },
    stopAll(fadeMs) {
      const fade = fadeMs === undefined ? defaultFade : fadeMs / 1000;
      for (const sound of [...sounds]) end(sound, fade);
    },
    stats(): AudioStats {
      const stats: AudioStats = {
        context: manager.state,
        pending: 0,
        real: 0,
        virtual: 0,
        releasing: releasing.size,
        sounds: [],
      };
      for (const sound of sounds) {
        if (sound.state !== 'ended') stats[sound.state]++;
        stats.sounds.push({
          id: sound.id,
          sound: sound.name,
          state: sound.state,
          score: sound.score,
        });
      }
      return stats;
    },
    dispose() {
      if (disposed) return;
      manager.stopAll(0);
      for (const voice of releasing) voice.finish();
      timers.clearInterval(interval);
      stopFrames();
      const context = ctx;
      ctx = master = limiter = null;
      disposed = true;
      if (context && ownsContext && context.state !== 'closed') context.close().catch(() => {});
    },
  };
  return manager;
}
