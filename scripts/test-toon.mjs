// Toon look (src/toon.js) for every player: stepped lighting patched once into
// Three's lit materials, outlines as a depth post-process, a fixed look with no
// player setting.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {
  installToonLighting,
  setToonBands,
  toonUniform,
  OutlinePass,
  ToonRenderer,
  TOON_LOOK,
} from '../src/toon.ts';
import { DEFAULT_FLIGHT_TUNING, normalizeFlightTuning } from '../src/flight-tuning.ts';
import { readFileSync } from 'node:fs';
import {
  installOfficeFog,
  fogOpticalDepth,
  OFFICE_DISTANCE_FOG,
  OFFICE_FOG_START,
  OFFICE_CLOUD_TOP,
} from '../src/office-fog.ts';

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
// The game's look is fixed: three bands and 1.5 px outlines, no setting needed.
assert.deepEqual({ ...TOON_LOOK }, { toonShading: true, toonBands: 3, toonOutline: 1.5 });
let toon = new ToonRenderer(T, fake(false));
toon.render(scene, camera);
assert.deepEqual(calls.splice(0), [['render', 'world']], 'software renderer untouched');
toon = new ToonRenderer(T, fake(true));
assert.equal(toonUniform.value, 3, 'stepped lighting on from the start');
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
assert.equal(uniforms.radius.value, 1.5 * (900 / 900), 'thickness scales with the screen height');
assert.ok(Math.abs(uniforms.logRange.value - Math.log2(41)) < 1e-12);
assert.deepEqual(toon.pass.size, [1600, 900]);
assert.ok(toon.pass.target.depthTexture, 'depth texture for the edges');
// Other looks stay available to the code (tests, tools): off means one plain render.
toon.configure({ toonShading: false, toonOutline: 0 });
toon.render(scene, camera);
assert.deepEqual(calls.splice(0), [['render', 'world']], 'off: a single plain render');
assert.equal(toonUniform.value, 0);
// The shader's depth decoding inverts the log depth buffer exactly.
const decode = (d) => 2 ** (d * Math.log2(41)) - 1;
for (const w of [0.0002, 0.02, 0.37, 12, 39.9])
  assert.ok(Math.abs(decode(Math.log2(1 + w) / Math.log2(41)) / w - 1) < 1e-9);
const source = new OutlinePass(T, fake(true)).material.fragmentShader;
for (const part of ['tonemapping_fragment', 'colorspace_fragment', 'inverseDepth', 'laplacian'])
  assert.ok(source.includes(part), part);
assert.ok(source.includes('sky'), 'the sky keeps its clear colour');

// Lines fade with the fog of the surface they outline (rods vanish into the clouds).
assert.match(source, /line \*= 1\.0 - fog;/);
const fogPass = new OutlinePass(T, fake(true));
const fu = fogPass.material.uniforms;
const eyeCam = new T.PerspectiveCamera(62, 16 / 9, 0.00005, 40);
eyeCam.position.set(0.4, 1.6, 2.2);
eyeCam.lookAt(-0.7, 2.3, 1.1);
eyeCam.updateMatrixWorld();
fogPass.fog(scene, eyeCam);
assert.equal(fu.fogMode.value, 0, 'no fog, no fading');
installOfficeFog(T);
scene.fog = new T.FogExp2('#ffffff', OFFICE_DISTANCE_FOG);
fogPass.fog(scene, eyeCam);
assert.equal(fu.fogMode.value, 1, 'office cloud layer');
assert.ok(Math.abs(fu.fogStart.value - OFFICE_FOG_START) < 1e-9);
assert.ok(Math.abs(fu.fogStart.value + fu.fogThickness.value - OFFICE_CLOUD_TOP) < 1e-9);
// The shader rebuilds a pixel's world point from its depth like this.
const point = new T.Vector3(-0.6, 2.7, 1.0);
const ndc = point.clone().project(eyeCam);
const depth = -point.clone().applyMatrix4(eyeCam.matrixWorldInverse).z;
const rebuilt = new T.Vector3(
  (ndc.x * depth) / fu.focal.value.x,
  (ndc.y * depth) / fu.focal.value.y,
  -depth,
).applyMatrix4(fu.cameraWorld.value);
assert.ok(rebuilt.distanceTo(point) < 1e-9, 'world point from depth');
assert.ok(fu.eye.value.distanceTo(eyeCam.position) < 1e-12);
// Same optical depth as the materials: a point in the clouds loses its line.
const optical =
  fogOpticalDepth(eyeCam.position.y, point.y, point.distanceTo(eyeCam.position)) +
  (OFFICE_DISTANCE_FOG * depth) ** 2;
assert.ok(1 - Math.exp(-optical) > 0.9, 'outline of a rod in the clouds mostly faded');
scene.fog = new T.Fog('#172c39', 35, 85);
fogPass.fog(scene, eyeCam);
assert.deepEqual([fu.fogMode.value, fu.fogNear.value, fu.fogFar.value], [2, 35, 85], 'linear fog');
scene.fog = null;

// No player setting: the personal panel is pilot-only again.
for (const key of Object.keys(DEFAULT_FLIGHT_TUNING)) assert.ok(!/toon/i.test(key), key);
assert.ok(!('toonOutline' in normalizeFlightTuning({ toonOutline: 4 })));
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /new ToonRenderer\(T, renderer\)/);
assert.doesNotMatch(client, /toon\.configure/);
assert.equal(
  (client.match(/renderer\.render\(/g) || []).length,
  0,
  'every frame goes through toon',
);
const html = readFileSync('src/index.html', 'utf8');
assert.ok(
  !/dessin animé|toon/i.test(
    html.slice(html.indexOf('id="flightSettingsPanel"'), html.indexOf('id="bank"')),
  ),
);
console.log(
  'Toon look: fixed for everyone, stepped lighting, depth outlines, software fallback untouched',
);
