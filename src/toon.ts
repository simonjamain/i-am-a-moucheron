// Toon look for every player: stepped (cell-shaded) lighting plus dark outlines,
// fixed by TOON_LOOK (no player setting). Lighting is Three's own toon lighting model,
// plugged once into its lit node materials with a shared gradient texture, so
// switching the band count needs no recompilation.
// Outlines are a post-process on the log depth buffer the game already uses:
// a pixel just behind a nearer surface gets the line colour, flat slopes are
// ignored (the Laplacian of inverse depth vanishes on planes).
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { officeFogLayer } from './office-fog.ts';
import {
  fullscreenMaterial,
  fullscreenScene,
  targetUv,
  tsl,
  withoutToneMapping,
  type Node,
} from './gpu-passes.ts';

/** Shared uniform of the stepped lighting (its `.value` is the band count; 0 = smooth). */
export const toonUniform: { value: number } = { value: 0 };
let installed = false;
const RAMP = 64;
let ramp: THREE.DataTexture | null = null;

// Fills the gradient texture read by Three's own toon lighting model (brightness against
// N·L / 2 + 0.5, so the lit half is the upper half): `bands` hard steps over the lit
// half, from none to full light, or a smooth ramp when below 2.
function paintRamp(bands: number): void {
  if (!ramp) return;
  const data = ramp.image.data as Uint8Array;
  for (let i = 0; i < RAMP; i++) {
    const lit = Math.max(0, ((i + 0.5) / RAMP - 0.5) * 2);
    const level = bands >= 2 ? Math.min(Math.floor(lit * bands), bands - 1) / (bands - 1) : lit;
    data[i] = Math.round(255 * level);
  }
  ramp.needsUpdate = true;
}

/**
 * Switches every lit node material to Three's native toon lighting model (the one of
 * MeshToonNodeMaterial) with a shared gradient texture, so the whole scene is stepped
 * without converting each material. Idempotent.
 */
export function installToonLighting(T: Three): boolean {
  if (installed) return false;
  installed = true;
  ramp = new T.DataTexture(new Uint8Array(RAMP), RAMP, 1, T.RedFormat);
  ramp.magFilter = ramp.minFilter = T.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.colorSpace = T.NoColorSpace;
  // Binds the public holder to the band count: writing `.value` repaints the ramp.
  let bands = 0;
  Object.defineProperty(toonUniform, 'value', {
    get: () => bands,
    set: (v: number) => {
      bands = v;
      paintRamp(v);
    },
  });
  paintRamp(0);
  const toonModel = new T.MeshToonNodeMaterial().setupLightingModel();
  const T_ = T as unknown as Record<string, { prototype: Record<string, unknown> }>;
  for (const name of [
    'MeshStandardNodeMaterial',
    'MeshPhysicalNodeMaterial',
    'MeshPhongNodeMaterial',
    'MeshLambertNodeMaterial',
  ]) {
    const proto = T_[name].prototype;
    proto.setupLightingModel = () => toonModel;
    Object.defineProperty(proto, 'gradientMap', { get: () => ramp, configurable: true });
  }
  return true;
}

export function setToonBands(bands: number): void {
  if (installed) toonUniform.value = bands >= 2 ? Math.round(bands) : 0;
}

export const OUTLINE_COLOR = '#1b1510';
// The look of the game: three light bands, 1.5 px outlines (validated in play).
export const TOON_LOOK = Object.freeze({ toonShading: true, toonBands: 3, toonOutline: 1.5 });

/** The game look, minus outlines when the page is opened with `?outline=false` (to measure their cost). */
export function toonLookFromQuery(search: string): ToonLook {
  const off = new URLSearchParams(search).get('outline') === 'false';
  return off ? { ...TOON_LOOK, toonOutline: 0 } : TOON_LOOK;
}

export interface ToonLook {
  toonShading?: boolean;
  toonBands?: number;
  toonOutline?: number;
}

/** Uniform nodes of the outline pass (each has a typed `.value`). */
type OutlineUniforms = Record<string, Node>;

export class OutlinePass {
  T: Three;
  renderer: THREE.WebGPURenderer;
  target: THREE.RenderTarget | null;
  size: [number, number];
  material: THREE.NodeMaterial;
  uniforms: OutlineUniforms;
  scene: THREE.Scene;
  camera: THREE.Camera;
  private colorTexture: Node;
  private depthTexture: Node;
  constructor(T: Three, renderer: THREE.WebGPURenderer) {
    this.T = T;
    this.renderer = renderer;
    this.target = null;
    this.size = [0, 0];
    const {
      uniform,
      texture,
      uv,
      vec2,
      vec3,
      vec4,
      float,
      select,
      smoothstep,
      mix,
      max,
      exp,
      pow,
      abs,
      length,
      toneMapping,
    } = tsl(T);
    const u: OutlineUniforms = {
      texel: uniform(new T.Vector2()),
      radius: uniform(1),
      near: uniform(0.1),
      far: uniform(40),
      threshold: uniform(0.1),
      lineColor: uniform(new T.Color(OUTLINE_COLOR)),
      fogMode: uniform(0),
      fogDensity: uniform(0),
      fogNear: uniform(0),
      fogFar: uniform(1),
      fogStart: uniform(0),
      fogThickness: uniform(1),
      focal: uniform(new T.Vector2(1, 1)),
      cameraWorld: uniform(new T.Matrix4()),
      eye: uniform(new T.Vector3()),
      exposure: uniform(1),
    };
    this.uniforms = u;
    // Placeholder textures, swapped for the render target's once it exists.
    const blank = new T.Texture();
    const blankDepth = new T.DepthTexture(1, 1);
    this.colorTexture = texture(blank);
    this.depthTexture = texture(blankDepth);
    const vUv = uv();
    const sampleUv = targetUv(T);
    const depthAt = (coord: Node) => this.depthTexture.sample(coord).r;
    // Inverse view depth from the logarithmic depth buffer: d = log(w / near) / log(far / near).
    const inverseDepth = (coord: Node) => {
      const w = u.near.mul(pow(u.far.div(u.near), depthAt(coord)));
      return float(1).div(max(w, 1e-7));
    };
    const centre = inverseDepth(sampleUv);
    let strength: Node = float(0);
    let nearest: Node = centre;
    const axes = [
      [1, 0],
      [0, 1],
      [0.7071, 0.7071],
      [0.7071, -0.7071],
    ];
    for (const [x, y] of axes) {
      const step = vec2(x, y).mul(u.texel).mul(u.radius);
      const a = inverseDepth(sampleUv.add(step)),
        b = inverseDepth(sampleUv.sub(step));
      strength = max(strength, a.add(b).sub(centre.mul(2)).div(centre));
      nearest = max(nearest, max(a, b));
    }
    let line: Node = smoothstep(u.threshold, u.threshold.mul(2), strength);
    // The line belongs to the nearest outlined surface: it takes that surface's fog.
    // Fog modes: 0 none, 1 office cloud layer (office-fog.ts), 2 linear, 3 exponential squared.
    const depth = float(1).div(nearest);
    const ndc = vUv.mul(2).sub(1);
    const world = u.cameraWorld.mul(
      vec4(ndc.x.mul(depth).div(u.focal.x), ndc.y.mul(depth).div(u.focal.y), depth.negate(), 1),
    ).xyz;
    const fa = max(0, u.eye.y.sub(u.fogStart)),
      fb = max(0, world.y.sub(u.fogStart)),
      dy = world.y.sub(u.eye.y);
    const average = select(
      abs(dy).lessThan(0.000001),
      fa.div(u.fogThickness),
      fb.mul(fb).sub(fa.mul(fa)).div(u.fogThickness.mul(2).mul(dy)),
    );
    const layer = select(
      u.fogMode.equal(1),
      max(0, average)
        .mul(length(world.sub(u.eye)))
        .mul(9),
      0,
    );
    const optical = u.fogDensity.mul(u.fogDensity).mul(depth).mul(depth).add(layer);
    const fogFactor = select(
      u.fogMode.equal(2),
      smoothstep(u.fogNear, u.fogFar, depth),
      float(1).sub(exp(optical.negate())),
    );
    line = select(u.fogMode.greaterThan(0), line.mul(float(1).sub(fogFactor)), line);
    const base = this.colorTexture.sample(sampleUv);
    const coloured = mix(base.rgb, u.lineColor, line);
    // The sky is a clear colour, which a direct render never tone-maps.
    // The renderer's own tone mapping (none for a bare renderer), applied here by hand.
    const mapped = toneMapping(renderer.toneMapping ?? T.NoToneMapping, u.exposure, coloured);
    const sky = depthAt(sampleUv).greaterThan(0.99999);
    this.material = fullscreenMaterial(T, vec4(select(sky, coloured, mapped.rgb), base.a));
    ({ scene: this.scene, camera: this.camera } = fullscreenScene(T, this.material));
  }
  resize(width: number, height: number): void {
    if (this.target && this.size[0] === width && this.size[1] === height) return;
    const T = this.T;
    this.target?.dispose();
    this.target?.depthTexture?.dispose();
    const depthTexture = new T.DepthTexture(width, height, T.FloatType);
    this.target = new T.RenderTarget(width, height, {
      type: T.HalfFloatType,
      samples: 4,
      depthTexture,
    });
    this.colorTexture.value = this.target.texture;
    this.depthTexture.value = depthTexture;
    this.size = [width, height];
  }
  // Draw `scene` with outlines of `thickness` pixels on screen.
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, thickness: number): void {
    const renderer = this.renderer,
      size = renderer.getDrawingBufferSize(new this.T.Vector2());
    this.resize(size.x, size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.uniforms;
    u.texel.value.set(1 / size.x, 1 / size.y);
    u.radius.value = thickness * (size.y / 900);
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.exposure.value = renderer.toneMappingExposure;
    this.fog(scene, camera);
    // The screen pass tone-maps by itself (the sky must stay a plain clear colour).
    withoutToneMapping(this.T, renderer, () => renderer.render(this.scene, this.camera));
  }
  // Scene fog and camera, for the fading of lines (same formulas as materials).
  fog(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const u = this.uniforms,
      fog = scene.fog as (THREE.Fog & THREE.FogExp2) | null,
      layer = officeFogLayer(this.T);
    u.fogMode.value = !fog ? 0 : fog.isFog ? 2 : layer ? 1 : 3;
    if (!fog) return;
    if (fog.isFog) {
      u.fogNear.value = fog.near;
      u.fogFar.value = fog.far;
    } else u.fogDensity.value = fog.density;
    if (layer) {
      u.fogStart.value = layer.start;
      u.fogThickness.value = layer.thickness;
    }
    const p = camera.projectionMatrix.elements;
    u.focal.value.set(p[0], p[5]);
    camera.updateMatrixWorld();
    u.cameraWorld.value.copy(camera.matrixWorld);
    u.eye.value.setFromMatrixPosition(camera.matrixWorld);
  }
  dispose(): void {
    this.target?.dispose();
    this.material.dispose();
  }
}

// Frame entry point: plain render unless the player asked for outlines.
export class ToonRenderer {
  T: Three;
  renderer: THREE.WebGPURenderer;
  pass: OutlinePass | null;
  bands: number;
  outline: number;
  available: boolean;
  constructor(T: Three, renderer: THREE.WebGPURenderer, look: ToonLook = TOON_LOOK) {
    this.T = T;
    this.renderer = renderer;
    this.pass = null;
    this.bands = 0;
    this.outline = 0;
    // The software fallback renderer has no GPU: leave it untouched.
    this.available = (renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;
    if (this.available) installToonLighting(T);
    this.configure(look);
  }
  configure({ toonShading = false, toonBands = 3, toonOutline = 0 }: ToonLook = {}): void {
    this.bands = toonShading ? toonBands : 0;
    this.outline = toonOutline;
    if (this.available) setToonBands(this.bands);
  }
  /** Depth of the last frame drawn with outlines (log depth buffer), else null. */
  depthTexture(): THREE.Texture | null {
    return (this.outline > 0 && this.pass?.target?.depthTexture) || null;
  }
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.available || !(this.outline > 0)) {
      this.renderer.render(scene, camera);
      return;
    }
    this.pass ??= new OutlinePass(this.T, this.renderer);
    this.pass.render(scene, camera, this.outline);
  }
}
