import assert from 'node:assert/strict';
import { renderInfo } from '../src/render-info.ts';

const env = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1.25,
  navigator: { hardwareConcurrency: 8, userAgent: 'TestChrome/1' },
};
// Software 2D fallback is reported as such.
const software = renderInfo(null, { isWebGPURenderer: false }, env).join('\n');
assert.match(software, /logiciel 2D/);
assert.match(software, /1920×1080 @1.25/);
// WebGL 2 report: GPU, depth bits, MSAA.
const gl = {
  VERSION: 1,
  DEPTH_BITS: 2,
  SAMPLES: 3,
  MAX_TEXTURE_SIZE: 4,
  RENDERER: 5,
  getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 10, UNMASKED_VENDOR_WEBGL: 11 }),
  getParameter: (n) => ({ 10: 'ANGLE (Test GPU)', 11: 'Test Inc', 2: 24, 3: 4, 4: 16384 })[n],
  getContextAttributes: () => ({ antialias: true }),
  isContextLost: () => false,
};
const webgl = renderInfo(
  null,
  { isWebGPURenderer: true, getPixelRatio: () => 1.25, backend: { gl } },
  env,
).join('\n');
assert.match(webgl, /WebGL 2/);
assert.match(webgl, /GPU : ANGLE \(Test GPU\)/);
assert.match(webgl, /Profondeur : 24 bits, MSAA oui \(4 échantillons\)/);
assert.match(webgl, /Pixel ratio utilisé : 1.25/);
// WebGPU report: adapter description and limits.
const gpu = renderInfo(
  null,
  {
    isWebGPURenderer: true,
    getPixelRatio: () => 2,
    backend: {
      isWebGPUBackend: true,
      adapter: { info: { vendor: 'test-vendor', description: 'Test WebGPU Adapter' } },
      device: { limits: { maxTextureDimension2D: 8192 } },
    },
  },
  env,
).join('\n');
assert.match(gpu, /Rendu : WebGPU/);
assert.match(gpu, /GPU : Test WebGPU Adapter/);
assert.match(gpu, /Fabricant : test-vendor/);
assert.match(gpu, /Texture max : 8192/);
// A throwing context never breaks the report.
const broken = renderInfo(
  null,
  {
    isWebGPURenderer: true,
    get backend() {
      throw Error('perdu');
    },
  },
  env,
);
assert.ok(
  broken.some((l) => /Écran/.test(l)),
  'the report survives a failing backend',
);
console.log(
  'Render info: software fallback, WebGPU and WebGL 2 reports, broken backend tolerated.',
);
