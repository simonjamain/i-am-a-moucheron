// Type-level acceptance tests of the audio library contract, checked by
// `npm run typecheck` (scripts/test-typescript.mjs): each @ts-expect-error must fail.
import { createAudioManager, fromBuffer, type SoundDef } from '../src/audio/index.ts';

declare const buffer: AudioBuffer;
const engine: SoundDef<{ speed: number }> = {
  ...fromBuffer<{ speed: number }>(() => buffer, { rate: (p) => 1 + p.speed / 100 }),
  loop: true,
};
const audio = createAudioManager({
  catalog: { shot: { ...fromBuffer(() => buffer), volume: 0.8 }, engine },
});
const score = () => 1;

audio.play('shot', { score });
audio.play('shot', { score, position: { x: 1, y: 2, z: 3 }, spatial: 'hrtf' });
audio.play('engine', { score, params: { speed: 3 } });
audio.play('engine', { score, params: () => ({ speed: 3 }), distance: { ref: 4 } });
const stop: (fadeMs?: number) => void = audio.play('shot', {
  score,
  position: () => ({ x: 0, y: 0, z: 0 }),
});
stop(200);

// @ts-expect-error unknown sound
audio.play('shott', { score });
// @ts-expect-error params required for a sound with params
audio.play('engine', { score });
// @ts-expect-error params forbidden for a sound without params
audio.play('shot', { score, params: {} });
// @ts-expect-error params of the wrong shape
audio.play('engine', { score, params: { speed: 'fast' } });
// @ts-expect-error score is required
audio.play('shot', {});
// @ts-expect-error spatial mode is a closed set
audio.play('shot', { score, spatial: 'binaural' });
