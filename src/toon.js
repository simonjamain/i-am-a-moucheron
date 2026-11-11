// Optional toon look: stepped (cell-shaded) lighting plus dark outlines, both
// local to the player and off by default. Lighting is patched into Three's lit
// materials once, with a shared uniform, so switching it needs no recompilation.
// Outlines are a post-process on the log depth buffer the game already uses:
// a pixel just behind a nearer surface gets the line colour, flat slopes are
// ignored (the Laplacian of inverse depth vanishes on planes).
export const toonUniform = { value: 0 };
let installed = false;

const STEP = `
uniform float toonBands;
float toonQuantize( const in float x ) {
	if ( toonBands < 1.5 ) return x;
	float b = x * toonBands;
	float f = floor( b );
	return ( f + smoothstep( 0.42, 0.58, b - f ) ) / toonBands;
}
`;

export function installToonLighting(T) {
  if (installed) return false;
  installed = true;
  const chunks = T.ShaderChunk;
  const patch = (name, from, to, declare = false) => {
    if (!chunks[name].includes(from)) throw Error('Three shader changed: ' + name);
    chunks[name] = (declare ? STEP : '') + chunks[name].replaceAll(from, to);
  };
  patch(
    'lights_pars_begin',
    'float hemiDiffuseWeight = 0.5 * dotNL + 0.5;',
    'float hemiDiffuseWeight = toonQuantize( 0.5 * dotNL + 0.5 );',
    true,
  );
  for (const name of ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment'])
    patch(
      name,
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      'float dotNL = toonQuantize( saturate( dot( geometryNormal, directLight.direction ) ) );',
    );
  // Every standard / lambert material shares one uniform (0 = smooth lighting).
  for (const Material of [T.MeshStandardMaterial, T.MeshLambertMaterial])
    Material.prototype.onBeforeCompile = function toonBind(shader) {
      shader.uniforms.toonBands = toonUniform;
    };
  return true;
}

export function setToonBands(bands) {
  toonUniform.value = bands >= 2 ? Math.round(bands) : 0;
}

const vertexShader = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
const fragmentShader = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float radius;
uniform float logRange;
uniform float threshold;
uniform vec3 lineColor;
varying vec2 vUv;
// Inverse view depth from the logarithmic depth buffer: d = log2(1 + w) / log2(far + 1).
float inverseDepth( const in vec2 uv ) {
	float d = texture2D( tDepth, uv ).x;
	return 1.0 / max( exp2( d * logRange ) - 1.0, 1e-7 );
}
void main() {
	vec4 base = texture2D( tColor, vUv );
	float centre = inverseDepth( vUv );
	float strength = 0.0;
	for ( int i = 0; i < 4; i++ ) {
		vec2 axis = i == 0 ? vec2( 1.0, 0.0 ) : i == 1 ? vec2( 0.0, 1.0 ) : i == 2 ? vec2( 0.7071, 0.7071 ) : vec2( 0.7071, -0.7071 );
		vec2 step = axis * texel * radius;
		float laplacian = ( inverseDepth( vUv + step ) + inverseDepth( vUv - step ) - 2.0 * centre ) / centre;
		strength = max( strength, laplacian );
	}
	float line = smoothstep( threshold, threshold * 2.0, strength );
	gl_FragColor = vec4( mix( base.rgb, lineColor, line ), base.a );
	// The sky is a clear colour, which a direct render never tone-maps.
	vec3 sky = gl_FragColor.rgb;
	#include <tonemapping_fragment>
	if ( texture2D( tDepth, vUv ).x > 0.99999 ) gl_FragColor.rgb = sky;
	#include <colorspace_fragment>
}`;

export const OUTLINE_COLOR = '#1b1510';

export class OutlinePass {
  constructor(T, renderer) {
    this.T = T;
    this.renderer = renderer;
    this.target = null;
    this.size = [0, 0];
    this.material = new T.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        texel: { value: new T.Vector2() },
        radius: { value: 1 },
        logRange: { value: 1 },
        threshold: { value: 0.1 },
        lineColor: { value: new T.Color(OUTLINE_COLOR) },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new T.Scene();
    this.scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.material));
    this.camera = new T.Camera();
  }
  resize(width, height) {
    if (this.target && this.size[0] === width && this.size[1] === height) return;
    const T = this.T;
    this.target?.dispose();
    this.target?.depthTexture?.dispose();
    this.target = new T.WebGLRenderTarget(width, height, {
      type: T.HalfFloatType,
      samples: 4,
      depthTexture: new T.DepthTexture(width, height, T.FloatType),
    });
    this.size = [width, height];
  }
  // Draw `scene` with outlines of `thickness` pixels on screen.
  render(scene, camera, thickness) {
    const renderer = this.renderer,
      size = renderer.getDrawingBufferSize(new this.T.Vector2());
    this.resize(size.x, size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const uniforms = this.material.uniforms;
    uniforms.tColor.value = this.target.texture;
    uniforms.tDepth.value = this.target.depthTexture;
    uniforms.texel.value.set(1 / size.x, 1 / size.y);
    uniforms.radius.value = thickness * (size.y / 900);
    uniforms.logRange.value = Math.log2(camera.far + 1);
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.target?.dispose();
    this.material.dispose();
  }
}

// Frame entry point: plain render unless the player asked for outlines.
export class ToonRenderer {
  constructor(T, renderer) {
    this.T = T;
    this.renderer = renderer;
    this.pass = null;
    this.bands = 0;
    this.outline = 0;
    // The software fallback renderer has no GL: leave it untouched.
    this.available = renderer.isWebGLRenderer === true;
    if (this.available) installToonLighting(T);
  }
  configure({ toonShading = false, toonBands = 3, toonOutline = 0 } = {}) {
    this.bands = toonShading ? toonBands : 0;
    this.outline = toonOutline;
    if (this.available) setToonBands(this.bands);
  }
  render(scene, camera) {
    if (!this.available || !(this.outline > 0)) {
      this.renderer.render(scene, camera);
      return;
    }
    this.pass ??= new OutlinePass(this.T, this.renderer);
    this.pass.render(scene, camera, this.outline);
  }
}
