import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync('scripts/review-shadows.html', 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const draw = source.slice(source.indexOf('function draw('), source.indexOf('const next ='));
let begun = 0,
  ended = 0;
const context = vm.createContext({
  pose() {},
  running: true,
  query: null,
  querySamples: null,
  timer: { TIME_ELAPSED_EXT: 1 },
  gl: {
    isContextLost: () => false,
    createQuery: () => ({}),
    beginQuery() {
      begun++;
    },
    endQuery() {
      ended++;
    },
    getQueryParameter: () => false,
  },
  performance: { now: () => 0 },
  renderer: { render() {}, info: { render: { calls: 5, triangles: 100 } } },
  scene: {},
  camera: {},
});
vm.runInContext(draw, context);
const stats = { cpu: [], gpu: [], calls: [], triangles: [] };
context.stats = stats;
vm.runInContext('draw(0,stats);draw(1,stats);draw(2,stats)', context);
assert.equal(begun, 1);
assert.equal(ended, 1, 'a pending GPU query must not be ended repeatedly');
assert.equal(stats.cpu.length, 3);
assert.deepEqual(stats.calls, [5, 5, 5]);
console.log(
  'Shadow comparison instrumentation: one begin/end per GPU query, three render samples recorded. No actual GPU measurement.',
);

// Execute the comparator scene setup with the real models: its insects must
// have the same miniature scale as the game, rather than raw metre-sized meshes.
const T = await import('../vendor/three.module.min.js');
const { createGraphics } = await import('../src/graphics.js');
const { ACTOR_UNIT, INSECT_SCALE } = await import('../src/scale.js');
const { insectScale } = await import('../src/insect-status.js');
const setup = source.slice(source.indexOf('const $ ='), source.indexOf('let variant ='));
const setupContext = vm.createContext({
  T,
  ACTOR_UNIT,
  INSECT_SCALE,
  insectScale,
  createGraphics,
  createOffice() {},
  createRenderer: () => ({ isWebGLRenderer: true }),
  document: { getElementById: () => ({}) },
  innerWidth: 1280,
  innerHeight: 720,
});
vm.runInContext(setup, setupContext);
assert.equal(vm.runInContext('insects.length', setupContext), 120);
assert.equal(vm.runInContext('fleet.length', setupContext), 7);
assert.equal(
  vm.runInContext('insects[0].scale.x', setupContext),
  insectScale('midge', INSECT_SCALE, 1),
);
console.log('Shadow comparison scene: real seven-vehicle fleet and 120 correctly scaled insects.');
