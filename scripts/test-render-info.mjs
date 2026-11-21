import assert from 'node:assert/strict';
import { renderInfo } from '../src/render-info.ts';

const env = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1.25,
  navigator: { hardwareConcurrency: 8, userAgent: 'TestChrome/1' },
};
// Software 2D fallback is reported as such.
const software = renderInfo(null, { isWebGLRenderer: false }, env).join('\n');
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
  {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: true },
    getPixelRatio: () => 1.25,
    getContext: () => gl,
  },
  env,
).join('\n');
assert.match(webgl, /WebGL 2/);
assert.match(webgl, /GPU : ANGLE \(Test GPU\)/);
assert.match(webgl, /Profondeur : 24 bits, MSAA oui \(4 échantillons\)/);
assert.match(webgl, /Pixel ratio utilisé : 1.25/);
// A throwing context never breaks the report.
const broken = renderInfo(
  null,
  {
    isWebGLRenderer: true,
    getContext: () => {
      throw Error('perdu');
    },
  },
  env,
).join('\n');
assert.match(broken, /WebGL 1/);
console.log('Render info: software fallback, GPU/depth/MSAA report, broken context tolerated.');
