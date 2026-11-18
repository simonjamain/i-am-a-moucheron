// Game-side adapter over the audio library: keeps the game's short calls
// (kind + position + ref) and turns them into scored logical sounds.
import { createAudioManager } from '../audio/index.ts';
import type { AudioManager, AudioStats, AudioTimers, Stop, Vec3Like } from '../audio/index.ts';
import { GAME_CATALOG, type GameCatalog, type LoopKind, type LoopParams } from './catalog.ts';
import { AUDIO_PROFILES, type SoundKind } from './synth.ts';
import { soundScore } from './scores.ts';

/** Real voices across one-shots, followers and loops (was 24 + 16 + 20). */
export const MAX_VOICES = 48;
const ROLLOFF = 1.3;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Tracked {
  stop: Stop;
  position: Vec3;
}

interface LoopEntry extends Tracked {
  params: LoopParams;
}

const copy = (p: Partial<Vec3Like> | null | undefined, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 => {
  out.x = Number(p?.x) || 0;
  out.y = Number(p?.y) || 0;
  out.z = Number(p?.z) || 0;
  return out;
};

export interface GameSoundOptions {
  volume?: number;
  muted?: boolean;
  /** Context factory (tests); default: the browser AudioContext. */
  context?: () => AudioContext;
  timers?: AudioTimers;
  warn?: (message: string) => void;
}

export class GameSound {
  readonly manager: AudioManager<GameCatalog>;
  /** World units per metre-like unit of the current scene. */
  distanceScale = 1;
  scene: string | null = null;
  volume: number;
  muted: boolean;
  hidden = false;
  private readonly ear: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly forward: Vec3 = { x: 0, y: 0, z: -1 };
  private readonly up: Vec3 = { x: 0, y: 1, z: 0 };
  private readonly loops = new Map<string, LoopEntry>();
  private readonly following = new Map<string, Tracked>();
  private readonly last = new Map<string, number>();

  constructor({ volume = 0.55, muted = false, context, timers, warn }: GameSoundOptions = {}) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.muted = !!muted;
    this.manager = createAudioManager({
      catalog: GAME_CATALOG,
      maxVoices: MAX_VOICES,
      volume: this.volume,
      context,
      listener: () => ({ position: this.ear, forward: this.forward, up: this.up }),
      timers,
      warn,
    });
    this.manager.setMuted(this.muted);
  }

  get running(): boolean {
    return this.manager.state === 'running' && !this.hidden && !this.muted;
  }

  /** Opens or resumes the context; call from a user gesture. */
  unlock(): Promise<boolean> {
    return this.manager.resume();
  }

  private applyVolume() {
    this.manager.setVolume(this.volume);
    this.manager.setMuted(this.muted || this.hidden);
  }
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.applyVolume();
  }
  setMuted(muted: boolean) {
    this.muted = !!muted;
    this.applyVolume();
    if (this.muted) this.clear();
  }
  visibility(hidden: boolean) {
    this.hidden = hidden;
    this.applyVolume();
    if (hidden) this.clear();
  }
  setScene(scene: string) {
    if (this.scene === scene) return;
    this.clear();
    this.last.clear();
    this.scene = scene;
  }

  listener(position: Vec3Like, forward: Vec3Like, up: Vec3Like) {
    copy(position, this.ear);
    copy(forward, this.forward);
    copy(up, this.up);
  }

  private distance(ref: number) {
    return {
      model: 'inverse' as const,
      ref: ref * this.distanceScale,
      max: (this.scene === 'purgatory' ? 55 : 200) * this.distanceScale,
      rolloff: ROLLOFF,
    };
  }

  private scorer(kind: SoundKind, position: Vec3, ref: number, level: () => number, boost = 1) {
    const distance = this.distance(ref);
    return () => soundScore(kind, position, this.ear, distance, level(), boost);
  }

  /** One-shot at a fixed point. `key` + `cooldown` (seconds) skip repeats. */
  play(
    kind: SoundKind,
    pos: Vec3Like,
    { key = '', cooldown = 0, ref = 6, level = 1 } = {},
  ): boolean {
    if (!this.running || !(kind in AUDIO_PROFILES) || isLoop(kind)) return false;
    const now = performance.now() / 1000;
    if (key && now - (this.last.get(key) ?? -Infinity) < cooldown) return false;
    if (key) {
      this.last.set(key, now);
      if (this.last.size > 256) this.last.delete(this.last.keys().next().value!);
    }
    const position = copy(pos);
    this.manager.play(kind as Exclude<SoundKind, LoopKind>, {
      score: this.scorer(kind, position, ref, () => level),
      position,
      spatial: 'hrtf',
      volume: level,
      distance: this.distance(ref),
    });
    return true;
  }

  /** Keeps a loop alive this frame; loops absent from the next `keep` stop. */
  loop(
    key: string,
    kind: LoopKind,
    pos: Vec3Like,
    { rate = 1, level = 1, ref = 8, priority = 1 } = {},
  ): void {
    if (!this.running) return;
    let entry = this.loops.get(key);
    if (!entry) {
      const position = copy(pos),
        params = { rate, level };
      entry = {
        position,
        params,
        stop: this.manager.play(kind, {
          score: this.scorer(kind, position, ref, () => params.level, priority),
          position: () => position,
          spatial: 'hrtf',
          distance: this.distance(ref),
          params,
        }),
      };
      this.loops.set(key, entry);
    } else copy(pos, entry.position);
    entry.params.rate = rate;
    entry.params.level = level;
  }

  keep(keys: ReadonlySet<string>) {
    for (const [key, entry] of this.loops)
      if (!keys.has(key)) {
        entry.stop();
        this.loops.delete(key);
      }
  }

  /** One-shot that follows `moveFollowing` updates until it ends. */
  followOnce(key: string, kind: SoundKind, pos: Vec3Like, { ref = 8 } = {}): boolean {
    if (this.following.has(key) || !this.running || isLoop(kind)) return false;
    const position = copy(pos);
    const entry: Tracked = { position, stop: () => {} };
    this.following.set(key, entry);
    entry.stop = this.manager.play(kind as Exclude<SoundKind, LoopKind>, {
      score: this.scorer(kind, position, ref, () => 1),
      position: () => position,
      spatial: 'hrtf',
      distance: this.distance(ref),
      onEnded: () => {
        if (this.following.get(key) === entry) this.following.delete(key);
      },
    });
    return true;
  }
  moveFollowing(key: string, pos: Vec3Like) {
    const entry = this.following.get(key);
    if (entry) copy(pos, entry.position);
  }
  endFollowing(key: string) {
    const entry = this.following.get(key);
    if (!entry) return;
    this.following.delete(key);
    entry.stop();
  }

  /** Ends every sound; loops come back with the next `loop` calls. */
  clear() {
    this.loops.clear();
    this.following.clear();
    this.manager.stopAll();
  }

  async close() {
    this.clear();
    await this.manager.close();
  }

  stats(): AudioStats {
    return this.manager.stats();
  }
}

const isLoop = (kind: string) => GAME_CATALOG[kind as SoundKind]?.loop === true;
