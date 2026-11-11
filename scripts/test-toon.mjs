// Optional toon look (src/toon.js): stepped lighting patched once into Three's
// lit materials, outlines as a depth post-process, both off by default and local.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  installToonLighting,
  setToonBands,
  toonUniform,
  OutlinePass,
  ToonRenderer,
} from '../src/toon.js';
import {
  DEFAULT_FLIGHT_TUNING,
  FLIGHT_TUNING_FIELDS,
  normalizeFlightTuning,
} from '../src/flight-tuning.js';
import { readFileSync } from 'node:fs';

// Lighting: patched once, shared uniform, switchable without recompiling.
assert.equal(installToonLighting(T), true);
assert.equal(installToonLighting(T), false, 'installed once');
for (const chunk of [
  'lights_pars_begin',
  'lights_physical_pars_fragment',
  'lights_lambert_pars_fragment',
])
  assert.ok(T.ShaderChunk[chunk].includes('toonQuantize'), chunk + ' patched');
assert.ok(T.ShaderChunk.lights_pars_begin.includes('uniform float toonBands;'));
const shader = { uniforms: {} };
new T.MeshStandardMaterial().onBeforeCompile(shader);
assert.equal(shader.uniforms.toonBands, toonUniform, 'one shared uniform');
setToonBands(3);
assert.equal(toonUniform.value, 3);
setToonBands(0);
assert.equal(toonUniform.value, 0, 'smooth lighting by default');
setToonBands(1);
assert.equal(toonUniform.value, 0, 'fewer than two bands means off');

// Renderer wrapper: plain render unless outlines are asked, no GL pass without WebGL.
const calls = [];
const fake = (webgl) => ({
  isWebGLRenderer: webgl,
  render: (scene) => calls.push(['render', scene.name]),
  setRenderTarget: (target) => calls.push(['target', !!target]),
  getDrawingBufferSize: (v) => v.set(1600, 900),
});
const scene = Object.assign(new T.Scene(), { name: 'world' }),
  camera = new T.PerspectiveCamera(62, 16 / 9, 0.00005, 40);
let toon = new ToonRenderer(T, fake(false));
toon.configure({ toonShading: true, toonOutline: 3 });
toon.render(scene, camera);
assert.deepEqual(calls.splice(0), [['render', 'world']], 'software renderer untouched');
toon = new ToonRenderer(T, fake(true));
toon.configure({ toonShading: false, toonOutline: 0 });
toon.render(scene, camera);
assert.deepEqual(calls.splice(0), [['render', 'world']], 'off: a single plain render');
assert.equal(toonUniform.value, 0);
toon.configure({ toonShading: true, toonBands: 4, toonOutline: 2 });
assert.equal(toonUniform.value, 4);
toon.render(scene, camera);
assert.deepEqual(
  calls.splice(0),
  [
    ['target', true],
    ['render', 'world'],
    ['target', false],
    ['render', ''],
  ],
  'scene into the target, then the outline pass on screen',
);
const uniforms = toon.pass.material.uniforms;
assert.equal(uniforms.radius.value, 2 * (900 / 900), 'thickness scales with the screen height');
assert.ok(Math.abs(uniforms.logRange.value - Math.log2(41)) < 1e-12);
assert.deepEqual(toon.pass.size, [1600, 900]);
assert.ok(toon.pass.target.depthTexture, 'depth texture for the edges');
// The shader's depth decoding inverts the log depth buffer exactly.
const decode = (d) => 2 ** (d * Math.log2(41)) - 1;
for (const w of [0.0002, 0.02, 0.37, 12, 39.9])
  assert.ok(Math.abs(decode(Math.log2(1 + w) / Math.log2(41)) / w - 1) < 1e-9);
const source = new OutlinePass(T, fake(true)).material.fragmentShader;
for (const part of ['tonemapping_fragment', 'colorspace_fragment', 'inverseDepth', 'laplacian'])
  assert.ok(source.includes(part), part);
assert.ok(source.includes('sky'), 'the sky keeps its clear colour');

// Settings: personal, off by default, bounded.
assert.equal(DEFAULT_FLIGHT_TUNING.toonShading, false);
assert.equal(DEFAULT_FLIGHT_TUNING.toonOutline, 0);
assert.equal(DEFAULT_FLIGHT_TUNING.toonBands, 3);
const tuned = normalizeFlightTuning({ toonShading: true, toonBands: 99, toonOutline: -5 });
assert.equal(tuned.toonShading, true);
assert.equal(tuned.toonBands, FLIGHT_TUNING_FIELDS.toonBands.max);
assert.equal(tuned.toonOutline, 0);
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /new ToonRenderer\(T, renderer\)/);
assert.match(client, /toon\.configure\(settings\)/);
assert.equal(
  (client.match(/renderer\.render\(/g) || []).length,
  0,
  'every frame goes through toon',
);
console.log(
  'Toon look: stepped lighting, depth outlines, off by default, software fallback untouched',
);
