// Public contracts of the voice-managed audio library. This folder must stay
// independent from the game: it only imports its own files and Three.js types.
import type { Object3D } from 'three';

/** Any `{ x, y, z }` point (a Three.js `Vector3` fits). */
export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where a sound plays. A point is copied once at `play`; an `Object3D` is
 * followed through its world matrix (its last position stays once it leaves
 * the scene); a function is read again at every frame.
 */
export type SoundPosition = Object3D | Vec3Like | (() => Vec3Like);

/** Pose of the listener, usually the active camera. */
export interface ListenerPose {
  position: Vec3Like;
  /** Unit vector the listener looks along. */
  forward: Vec3Like;
  /** Unit vector of the listener's up direction. */
  up: Vec3Like;
}

/** PannerNode distance settings; missing fields keep Web Audio defaults. */
export interface DistanceOptions {
  model?: DistanceModelType;
  ref?: number;
  max?: number;
  rolloff?: number;
}

/** Decoded buffers, indexed by URL, available to `create`. */
export interface AssetStore {
  get(url: string): AudioBuffer | undefined;
}

/** What a sound factory returns each time the sound gets a real voice. */
export interface SoundOutput<P> {
  /** Last node of the sound's own chain; the manager adds gain and panner. */
  output: AudioNode;
  /** Nodes the manager starts and stops (buffer sources, oscillators…). */
  sources: AudioScheduledSourceNode[];
  /** One-shot length in seconds; missing = when every source has ended. */
  duration?: number;
  /** Receives the current params at every frame while the voice is real. */
  update?: (params: P) => void;
}

export interface SoundDef<P = void> {
  create: (ctx: BaseAudioContext, assets: AssetStore) => SoundOutput<P>;
  /** URLs fetched and decoded when the context opens. */
  preload?: readonly string[];
  /** Base volume, 0 to 1, default 1. */
  volume?: number;
  /** true = loop: may become virtual and resume later. */
  loop?: boolean;
  /** Default panner distances for this sound. */
  distance?: DistanceOptions;
}

export type Catalog = Record<string, SoundDef<any>>;
export type ParamsOf<D> = D extends SoundDef<infer P> ? P : never;

/** Ends the sound; idempotent and valid in every state. */
export type Stop = (fadeMs?: number) => void;

export type PlayOptions<P> = {
  /** Called at every tick; higher wins a voice. `<= minScore`: not played. */
  score: () => number;
  /** Missing = not spatialised. */
  position?: SoundPosition;
  /** "hrtf" asks for HRTF panning; "simple" (default) uses equalpower. */
  spatial?: 'hrtf' | 'simple';
  /** Volume multiplier for this instance, default 1. */
  volume?: number;
  /** Overrides the catalogue distances for this instance. */
  distance?: DistanceOptions;
} & ([P] extends [void] ? { params?: never } : { params: P | (() => P) });

/** Timers used by the manager; injectable for tests. */
export interface AudioTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Per-frame callback; missing = spatial updates run on the tick. */
  requestFrame?(callback: () => void): unknown;
  cancelFrame?(handle: unknown): void;
}

export interface AudioManagerConfig<C extends Catalog> {
  catalog: C;
  /** Context to use, or a factory called by the first `resume()`. */
  context?: AudioContext | (() => AudioContext);
  /** Listener object (world matrix) or a function returning its pose. */
  listener?: Object3D | (() => ListenerPose | null);
  /** Maximum real voices. Voices fading out (fadeMs) come on top. Default 64. */
  maxVoices?: number;
  /** Scheduler period in ms. Default 100. */
  tickMs?: number;
  /** Fade length for voice stealing and stop, in ms. Default 50. */
  fadeMs?: number;
  /** Minimum score to be played (exclusive). Default 0. */
  minScore?: number;
  /** Master volume, 0 to 1. Default 1. */
  volume?: number;
  /** Adds a compressor before the destination. Default true. */
  limiter?: boolean;
  /** Fetches preloaded URLs. Default `fetch`. */
  load?: (url: string) => Promise<ArrayBuffer>;
  timers?: AudioTimers;
  /** Diagnostics sink. Default `console.warn`. */
  warn?: (message: string) => void;
}

export type SoundState = 'pending' | 'real' | 'virtual' | 'ended';

export type ContextState = 'closed' | 'suspended' | 'running' | 'unavailable';

export interface AudioStats {
  context: ContextState;
  pending: number;
  real: number;
  virtual: number;
  /** Voices fading out after a stop or a steal, on top of `real`. */
  releasing: number;
  sounds: { id: number; sound: string; state: SoundState; score: number }[];
}

export interface AudioManager<C extends Catalog> {
  play<K extends keyof C & string>(sound: K, options: PlayOptions<ParamsOf<C[K]>>): Stop;
  /** Creates or resumes the context; call it from a user gesture. */
  resume(): Promise<boolean>;
  /** Suspends the context; real voices freeze, new one-shots are dropped. */
  suspend(): Promise<void>;
  /** Releases the context; loops survive as virtual sounds until `resume()`. */
  close(): Promise<void>;
  readonly state: ContextState;
  /** Resolved when every preload is decoded or has failed. */
  readonly ready: Promise<void>;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Ends every logical sound. */
  stopAll(fadeMs?: number): void;
  stats(): AudioStats;
  /** Stops everything for good: timers, nodes and the owned context. */
  dispose(): void;
}
