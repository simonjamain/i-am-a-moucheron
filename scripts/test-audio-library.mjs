// Voice-managed audio library (src/audio/): scheduling, virtual loops,
// spatialisation and lifecycle, against a fake Web Audio context.
import assert from 'node:assert/strict';
import { createAudioManager, fromBuffer, fromUrl } from '../src/audio/index.ts';
import { schedule } from '../src/audio/scheduler.ts';
import { FakeContext, fakeTimers, flush } from './audio-fake-context.mjs';

const second = (ctx) => ctx.createBuffer(1, 1000, 1000); // 1 s
const twoSeconds = (ctx) => ctx.createBuffer(1, 2000, 1000);
const catalog = {
  blip: fromBuffer(second),
  hum: { ...fromBuffer(twoSeconds, { rate: (p) => p.rate }), loop: true, volume: 0.5 },
};

function setup(options = {}) {
  const ctx = new FakeContext();
  const timers = fakeTimers(options.timers);
  const warnings = [];
  const audio = createAudioManager({
    catalog,
    context: () => ctx,
    timers,
    warn: (m) => warnings.push(m),
    ...options.config,
  });
  return { ctx, timers, warnings, audio };
}

// Pure scheduler: best scores win, ties keep the playing voice, then age.
{
  const c = (id, score, state = 'pending', loop = false) => ({ id, score, state, loop });
  const list = [
    c(1, 1),
    c(2, 5),
    c(3, 3, 'real', true),
    c(4, 3),
    c(5, 0, 'pending', true),
    c(6, NaN),
  ];
  const targets = new Map([...schedule(list, 2, 0)].map(([k, v]) => [k.id, v]));
  assert.deepEqual(Object.fromEntries(targets), {
    1: 'ended',
    2: 'real',
    3: 'real',
    4: 'ended',
    5: 'virtual',
    6: 'ended',
  });
}

// No context before the first gesture: one-shots are dropped, loops wait.
{
  const { ctx, audio, timers } = setup();
  assert.equal(audio.state, 'closed');
  const stopBlip = audio.play('blip', { score: () => 1 });
  audio.play('hum', { score: () => 1, params: { rate: 1 } });
  await flush();
  assert.deepEqual([audio.stats().real, audio.stats().virtual], [0, 1]);
  assert.equal(ctx.created.length, 0, 'no node before resume');
  stopBlip();
  stopBlip(); // idempotent on a rejected sound
  assert.equal(await audio.resume(), true);
  await flush();
  assert.equal(audio.stats().real, 1, 'the waiting loop starts once the context runs');
  timers.fire();
  assert.equal(audio.stats().real, 1);
}

// maxVoices: only the best scores own nodes; rejected one-shots create none.
{
  const { ctx, audio } = setup({ config: { maxVoices: 4 } });
  await audio.resume();
  for (let i = 0; i < 10; i++) audio.play('blip', { score: () => i });
  await flush();
  const stats = audio.stats();
  assert.equal(stats.real, 4);
  assert.deepEqual(
    stats.sounds.map((s) => s.score).sort((a, b) => a - b),
    [6, 7, 8, 9],
  );
  assert.equal(ctx.created.filter((n) => n.kind === 'buffer').length, 4);
}

// Score ≤ minScore never plays; a throwing score counts as 0 and is reported once.
{
  const { audio, warnings, timers } = setup();
  await audio.resume();
  audio.play('hum', {
    score: () => {
      throw Error('boom');
    },
    params: { rate: 1 },
  });
  audio.play('blip', { score: () => 0 });
  await flush();
  timers.fire();
  timers.fire();
  assert.deepEqual([audio.stats().real, audio.stats().virtual], [0, 1]);
  assert.equal(warnings.filter((w) => w.includes('boom')).length, 1);
}

// A loop demoted then promoted resumes at the expected offset with a fade-in.
{
  const { ctx, audio, timers } = setup({ config: { maxVoices: 1 } });
  await audio.resume();
  let humScore = 5;
  const params = { rate: 1 };
  audio.play('hum', { score: () => humScore, params });
  await flush();
  const first = ctx.live('buffer')[0];
  assert.equal(first.loop, true, 'the manager loops buffer sources of looping sounds');
  assert.equal(first.offset, 0);
  ctx.advance(0.5);
  const stopBlocker = audio.play('hum', { score: () => 10, params: { rate: 1 } });
  await flush();
  assert.equal(audio.stats().virtual, 1, 'the weaker loop became virtual');
  ctx.advance(0.1); // fade-out done
  timers.fire();
  assert.equal(first.ended, true);
  ctx.advance(2.9); // 3.5 s since the first loop started
  stopBlocker(0);
  timers.fire();
  const resumed = ctx.live('buffer').at(-1);
  assert.notEqual(resumed, first);
  assert.ok(Math.abs(resumed.offset - 1.5) < 0.11, 'offset ' + resumed.offset);
  const gain = resumed.connections[0].connections[0]; // source → factory gain → voice gain
  assert.deepEqual(gain.gain.events[0].slice(0, 2), ['set', 0], 'resume fades in');
  humScore = 0;
}

// params reach update() only while the voice is real, at every frame.
{
  const { ctx, audio, timers } = setup();
  await audio.resume();
  const params = { rate: 1.5 };
  let score = 1;
  audio.play('hum', { score: () => score, params });
  await flush();
  const source = ctx.live('buffer')[0];
  assert.equal(source.playbackRate.value, 1.5, 'update receives params on promotion');
  params.rate = 2;
  timers.frame();
  assert.equal(source.playbackRate.value, 2);
  score = 0;
  timers.fire();
  params.rate = 3;
  timers.frame();
  assert.equal(source.playbackRate.value, 2, 'a virtual sound is not updated');
}

// Stop: fade, then end; idempotent on ended and virtual sounds.
{
  const { ctx, audio, timers } = setup();
  await audio.resume();
  const stop = audio.play('blip', { score: () => 1 });
  await flush();
  const [source] = ctx.live('buffer');
  stop(200);
  assert.equal(audio.stats().releasing, 1, 'a stopped voice fades out');
  assert.equal(source.stopAt, 0.2);
  stop();
  ctx.advance(0.3);
  timers.fire();
  assert.equal(audio.stats().releasing, 0);
  assert.equal(ctx.live('buffer').length, 0, 'nodes are freed after the fade');
  let virtualScore = 0;
  const stopVirtual = audio.play('hum', { score: () => virtualScore, params: { rate: 1 } });
  await flush();
  assert.equal(audio.stats().virtual, 1);
  stopVirtual();
  stopVirtual();
  assert.equal(audio.stats().sounds.length, 0);
  virtualScore = 1;
}

// One-shots end on their own and free their nodes.
{
  const { ctx, audio, timers } = setup();
  await audio.resume();
  audio.play('blip', { score: () => 1 });
  await flush();
  ctx.advance(1.01);
  timers.fire();
  assert.equal(audio.stats().sounds.length, 0);
  assert.equal(ctx.live('buffer').length, 0);
}

// Spatialisation: simple by default, HRTF on request without quota, none without position.
{
  const { ctx, audio } = setup({ config: { maxVoices: 32 } });
  await audio.resume();
  for (let i = 0; i < 12; i++)
    audio.play('blip', { score: () => 1, position: { x: i, y: 0, z: 0 }, spatial: 'hrtf' });
  audio.play('blip', { score: () => 1, position: { x: 0, y: 0, z: 0 } });
  audio.play('blip', { score: () => 1 });
  await flush();
  const panners = ctx.live('panner');
  assert.equal(panners.length, 13);
  assert.equal(panners.filter((p) => p.panningModel === 'HRTF').length, 12);
  assert.equal(panners.filter((p) => p.panningModel === 'equalpower').length, 1);
}

// Positions: a point is copied, an Object3D and a getter are followed every frame.
{
  const { ctx, audio, timers } = setup();
  await audio.resume();
  const point = { x: 1, y: 2, z: 3 };
  const object = { isObject3D: true, matrixWorld: { elements: new Array(16).fill(0) } };
  object.matrixWorld.elements[12] = 7;
  let getterX = 4;
  audio.play('blip', { score: () => 3, position: point, distance: { ref: 9, rolloff: 2 } });
  audio.play('blip', { score: () => 2, position: object });
  audio.play('blip', { score: () => 1, position: () => ({ x: getterX, y: 0, z: 0 }) });
  await flush();
  const [p1, p2, p3] = ctx.live('panner');
  assert.deepEqual([p1.positionX.value, p1.positionY.value, p1.positionZ.value], [1, 2, 3]);
  assert.deepEqual([p1.refDistance, p1.rolloffFactor], [9, 2]);
  point.x = 100;
  object.matrixWorld.elements[12] = 8;
  getterX = 5;
  timers.frame();
  assert.equal(p1.positionX.value, 1, 'a point is copied at play');
  assert.equal(p2.positionX.value, 8);
  assert.equal(p3.positionX.value, 5);
}

// Listener: an Object3D pose (looking along -Z) or a function.
{
  const { ctx, audio, timers } = setup({
    config: {
      listener: () => ({
        position: { x: 1, y: 2, z: 3 },
        forward: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
      }),
    },
  });
  await audio.resume();
  timers.frame();
  assert.deepEqual(
    ['positionX', 'positionZ', 'forwardX', 'upY'].map((k) => ctx.listener[k].value),
    [1, 3, 1, 1],
  );
  const camera = {
    isObject3D: true,
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1] },
  };
  const second = setup({ config: { listener: camera } });
  await second.audio.resume();
  second.timers.frame();
  const l = second.ctx.listener;
  assert.deepEqual([l.positionX.value, l.forwardZ.value, l.upY.value], [4, -1, 1]);
}

// Without frame timers, spatial updates run on the scheduler tick.
{
  const { ctx, audio, timers } = setup({ timers: { frames: false } });
  await audio.resume();
  let x = 1;
  audio.play('blip', { score: () => 1, position: () => ({ x, y: 0, z: 0 }) });
  await flush();
  x = 2;
  timers.fire();
  assert.equal(ctx.live('panner')[0].positionX.value, 2);
}

// Suspended context: new one-shots are dropped; master volume and mute.
{
  const { ctx, audio } = setup({ config: { volume: 0.4 } });
  await audio.resume();
  const master = ctx.created.find((n) => n.kind === 'gain');
  assert.equal(master.gain.value, 0.4);
  audio.setMuted(true);
  assert.equal(master.gain.value, 0);
  audio.play('blip', { score: () => 1 });
  audio.setMuted(false);
  audio.setVolume(2);
  assert.equal(master.gain.value, 1);
  await audio.suspend();
  assert.equal(audio.state, 'suspended');
  audio.play('blip', { score: () => 1 });
  await flush();
  assert.equal(audio.stats().sounds.length, 0);
}

// close() keeps loops as virtual sounds; resume() opens a new context for them.
{
  const contexts = [];
  const timers = fakeTimers();
  const audio = createAudioManager({
    catalog,
    timers,
    context: () => {
      contexts.push(new FakeContext());
      return contexts.at(-1);
    },
  });
  await audio.resume();
  audio.play('hum', { score: () => 1, params: { rate: 1 } });
  audio.play('blip', { score: () => 1 });
  await flush();
  assert.equal(audio.stats().real, 2);
  await audio.close();
  assert.equal(audio.state, 'closed');
  assert.equal(contexts[0].state, 'closed');
  assert.deepEqual([audio.stats().real, audio.stats().virtual], [0, 1]);
  await audio.resume();
  await flush();
  assert.equal(contexts.length, 2);
  assert.equal(audio.stats().real, 1);
  assert.equal(contexts[1].live('buffer')[0].offset, 0);
  audio.stopAll(0);
  assert.equal(audio.stats().sounds.length, 0);
}

// Preload: ready settles even when a file fails; sounds of a failed file never play.
{
  const ctx = new FakeContext();
  const warnings = [];
  const audio = createAudioManager({
    catalog: { ok: fromUrl('/ok.ogg'), broken: { ...fromUrl(['/missing.ogg']), loop: true } },
    context: () => ctx,
    timers: fakeTimers(),
    warn: (m) => warnings.push(m),
    load: async (url) => (url === '/ok.ogg' ? new ArrayBuffer(500) : new ArrayBuffer(0)),
  });
  audio.play('ok', { score: () => 1 });
  await audio.resume();
  await audio.ready;
  assert.ok(warnings.some((w) => w.includes('/missing.ogg')));
  audio.play('ok', { score: () => 1 });
  audio.play('broken', { score: () => 1 });
  await flush();
  assert.equal(audio.stats().real, 1);
  assert.equal(audio.stats().virtual, 1);
}

// A failing factory ends its sound with a warning; unknown names are reported.
{
  const { audio, warnings } = setup({
    config: {
      catalog: {
        bad: {
          create: () => {
            throw Error('no node');
          },
        },
      },
    },
  });
  await audio.resume();
  audio.play('bad', { score: () => 1 });
  audio.play('nope', { score: () => 1 });
  await flush();
  assert.equal(audio.stats().sounds.length, 0);
  assert.ok(warnings.some((w) => w.includes('no node')));
  assert.ok(warnings.some((w) => w.includes('unknown sound nope')));
}

// dispose stops the timers, frees every node and closes the owned context.
{
  const { ctx, audio, timers } = setup();
  await audio.resume();
  audio.play('hum', { score: () => 1, params: { rate: 1 } });
  audio.play('blip', { score: () => 1 });
  await flush();
  audio.dispose();
  assert.equal(timers.cleared, true);
  assert.equal(timers.frameCallbacks.length, 0);
  assert.equal(ctx.live('buffer').length, 0);
  assert.equal(ctx.state, 'closed');
  assert.equal(audio.play('blip', { score: () => 1 })(), undefined);
}

// Scale: 500 logical sounds, 64 voices, one tick.
{
  const { audio, timers } = setup();
  await audio.resume();
  for (let i = 0; i < 500; i++)
    audio.play(i % 2 ? 'blip' : 'hum', { score: () => Math.random(), params: { rate: 1 } });
  await flush();
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) timers.fire();
  const tickMs = (performance.now() - t0) / 20;
  assert.ok(audio.stats().real <= 64);
  console.log(
    JSON.stringify({ audioLibrary: 'ok', sounds: 500, averageTickMs: +tickMs.toFixed(3) }),
  );
}
