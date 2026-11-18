// Game adapter over the audio library (src/game-audio/): catalogue, scores,
// one-shots, followers and frame-driven loops on a fake Web Audio context.
import assert from 'node:assert/strict';
import { GameSound, MAX_VOICES } from '../src/game-audio/game-sound.ts';
import { GAME_CATALOG, LOOP_KINDS } from '../src/game-audio/catalog.ts';
import { AUDIO_PROFILES } from '../src/game-audio/synth.ts';
import { SOUND_PRIORITY, inverseGain, soundScore } from '../src/game-audio/scores.ts';
import { FakeContext, fakeTimers, flush } from './audio-fake-context.mjs';

// Catalogue: every synthesised profile, loops flagged, levels kept.
assert.deepEqual(Object.keys(GAME_CATALOG).sort(), Object.keys(AUDIO_PROFILES).sort());
assert.deepEqual(Object.keys(SOUND_PRIORITY).sort(), Object.keys(AUDIO_PROFILES).sort());
for (const [kind, def] of Object.entries(GAME_CATALOG)) {
  assert.equal(!!def.loop, LOOP_KINDS.includes(kind), kind);
  assert.equal(def.volume, AUDIO_PROFILES[kind].level);
}

// Scores: inverse attenuation like the panner, interface sounds above combat.
assert.equal(inverseGain(1, 6, 1.3, 200), 1);
assert.ok(Math.abs(inverseGain(56, 6, 1.3, 200) - 6 / (6 + 1.3 * 50)) < 1e-12);
assert.equal(inverseGain(1000, 6, 1.3, 200), inverseGain(200, 6, 1.3, 200));
const ear = { x: 0, y: 0, z: 0 };
const far = { x: 100, y: 0, z: 0 };
const near = { x: 1, y: 0, z: 0 };
const dist = { ref: 6, rolloff: 1.3, max: 200 };
assert.ok(soundScore('dollar', near, ear, dist) > soundScore('shot', near, ear, dist));
assert.ok(soundScore('shot', near, ear, dist) > soundScore('shot', far, ear, dist));
assert.equal(soundScore('shot', { x: NaN, y: 0, z: 0 }, ear, dist), 0);

function setup(options = {}) {
  const ctx = new FakeContext();
  const timers = fakeTimers();
  const sound = new GameSound({ volume: 0.6, context: () => ctx, timers, ...options });
  return { ctx, timers, sound };
}

// Nothing before the first gesture; then one-shots are spatial HRTF voices.
{
  const { ctx, sound } = setup();
  assert.equal(sound.play('shot', { x: 0, y: 0, z: 0 }), false, 'no context before interaction');
  assert.equal(ctx.created.length, 0);
  assert.equal(await sound.unlock(), true);
  sound.distanceScale = 2;
  sound.setScene('flight');
  assert.equal(sound.play('shot', { x: 12, y: 0, z: -6 }, { ref: 7 }), true);
  await flush();
  const [panner] = ctx.live('panner');
  assert.equal(panner.panningModel, 'HRTF');
  assert.deepEqual([panner.positionX.value, panner.positionZ.value], [12, -6]);
  assert.deepEqual([panner.refDistance, panner.maxDistance, panner.rolloffFactor], [14, 400, 1.3]);
  const master = ctx.created.find((n) => n.kind === 'gain');
  assert.equal(master.gain.value, 0.6);
  sound.setScene('purgatory');
  assert.equal(ctx.live('buffer').length, 1, 'scene change fades out');
  sound.play('step', { x: 0, y: 0, z: 0 });
  await flush();
  assert.equal(ctx.live('panner').at(-1).maxDistance, 110);
}

// Cooldown keys skip repeats; loop kinds are not one-shots.
{
  const { sound } = setup();
  await sound.unlock();
  const pos = { x: 0, y: 0, z: 0 };
  assert.equal(sound.play('shot', pos, { key: 'a', cooldown: 10 }), true);
  assert.equal(sound.play('shot', pos, { key: 'a', cooldown: 10 }), false);
  assert.equal(sound.play('shot', pos, { key: 'b', cooldown: 10 }), true);
  assert.equal(sound.play('engine', pos), false);
}

// Saturation: important nearby sounds keep their voices, distant noise is dropped.
{
  const { ctx, sound } = setup();
  await sound.unlock();
  sound.listener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  for (let i = 0; i < 80; i++) sound.play('shot', { x: 150, y: 0, z: i }, { ref: 12 });
  sound.play('dollar', { x: 0, y: 0, z: 0 }, { ref: 100000 });
  sound.play('crash', { x: 3, y: 0, z: 0 }, { ref: 20 });
  await flush();
  const stats = sound.stats();
  assert.equal(stats.real, MAX_VOICES);
  for (const name of ['dollar', 'crash'])
    assert.ok(
      stats.sounds.some((s) => s.sound === name && s.state === 'real'),
      name + ' keeps a voice',
    );
  assert.equal(ctx.live('buffer').length, MAX_VOICES);
}

// Loops: created on first call, params and position follow, absent keys stop.
{
  const { ctx, sound, timers } = setup();
  await sound.unlock();
  sound.loop('engine-1', 'engine', { x: 1, y: 0, z: 0 }, { rate: 1.2, level: 0.5, ref: 10 });
  await flush();
  const [source] = ctx.live('buffer');
  assert.equal(source.loop, true);
  assert.equal(source.playbackRate.value, 1.2);
  sound.loop('engine-1', 'engine', { x: 4, y: 0, z: 0 }, { rate: 9, level: 0.5 });
  timers.frame();
  assert.equal(source.playbackRate.value, 3, 'rate is clamped');
  assert.equal(ctx.live('panner')[0].positionX.value, 4);
  sound.keep(new Set());
  ctx.advance(0.1);
  timers.fire();
  assert.equal(ctx.live('buffer').length, 0);
  assert.equal(sound.stats().sounds.length, 0);
  // Many loops: all logical, only the loudest real; a muted level loses its voice.
  for (let i = 0; i < 70; i++)
    sound.loop('e' + i, 'engine', { x: i, y: 0, z: 0 }, { rate: 1, level: 1 });
  await flush();
  assert.equal(sound.stats().real, MAX_VOICES);
  assert.equal(sound.stats().virtual, 70 - MAX_VOICES);
  sound.loop('e0', 'engine', { x: 0, y: 0, z: 0 }, { rate: 1, level: 0 });
  timers.fire();
  assert.equal(sound.stats().sounds.find((s) => s.score === 0).state, 'virtual');
}

// Followers: move with the object, end on their own and can be replayed.
{
  const { ctx, sound, timers } = setup();
  await sound.unlock();
  assert.equal(sound.followOnce('corpse', 'fall', { x: 0, y: 5, z: 0 }), true);
  assert.equal(sound.followOnce('corpse', 'fall', { x: 0, y: 5, z: 0 }), false);
  await flush();
  sound.moveFollowing('corpse', { x: 0, y: 2, z: 0 });
  timers.frame();
  assert.equal(ctx.live('panner')[0].positionY.value, 2);
  ctx.advance(AUDIO_PROFILES.fall.duration + 0.01);
  timers.fire();
  assert.equal(
    sound.followOnce('corpse', 'fall', { x: 0, y: 5, z: 0 }),
    true,
    'ended follower frees its key',
  );
  sound.endFollowing('corpse');
  sound.endFollowing('corpse');
  assert.equal(sound.stats().sounds.length, 0);
}

// Hidden tab and mute silence and clear; close then unlock reopens.
{
  const { ctx, sound } = setup();
  await sound.unlock();
  const master = ctx.created.find((n) => n.kind === 'gain');
  sound.loop('amb', 'ambience', { x: 0, y: 0, z: 0 });
  sound.visibility(true);
  assert.equal(master.gain.value, 0);
  assert.equal(sound.stats().sounds.length, 0);
  assert.equal(sound.play('stamp', { x: 0, y: 0, z: 0 }), false);
  sound.loop('amb', 'ambience', { x: 0, y: 0, z: 0 });
  assert.equal(sound.stats().sounds.length, 0, 'no loop while hidden');
  sound.visibility(false);
  assert.equal(master.gain.value, 0.6);
  sound.setMuted(true);
  assert.equal(master.gain.value, 0);
  sound.setMuted(false);
  sound.setVolume(0.25);
  assert.equal(master.gain.value, 0.25);
  await sound.close();
  assert.equal(ctx.state, 'closed');
  const contexts = [];
  const reopening = new GameSound({
    context: () => contexts[contexts.push(new FakeContext()) - 1],
    timers: fakeTimers(),
  });
  await reopening.unlock();
  await reopening.close();
  assert.equal(await reopening.unlock(), true, 'audio can reopen after page lifecycle cleanup');
  assert.equal(contexts.length, 2);
}
console.log('Game audio adapter: catalogue, scores, one-shots, loops, followers and lifecycle');
