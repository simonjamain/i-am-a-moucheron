// Public entry of the voice-managed audio library (no game imports allowed).
export { createAudioManager } from './manager.ts';
export { fromBuffer, fromUrl } from './helpers.ts';
export type { BufferOptions } from './helpers.ts';
export type {
  AssetStore,
  AudioManager,
  AudioManagerConfig,
  AudioStats,
  AudioTimers,
  Catalog,
  ContextState,
  DistanceOptions,
  ListenerPose,
  ParamsOf,
  PlayOptions,
  SoundDef,
  SoundOutput,
  SoundPosition,
  SoundState,
  Stop,
  Vec3Like,
} from './types.ts';
