// The cloud the purgatory stands on, drawn as a volume (docs/purgatory-scene.md):
// the same raymarched cloud as the sky's, as a thick layer whose misty top rises
// to the souls' knees, so that everyone walks half inside it.
// - It is a screen pass drawn after the scene (FloorCloud.render): each ray stops
//   at the nearest opaque surface (the scene's depth, from the cartoon renderer's
//   target), so a leg inside the mist is covered only by the cloud in front of it.
// - It is computed at 40 % resolution, keeping the farthest scene depth around
//   each pixel (no sky-coloured halo around the legs), then composited over the
//   frame.
// - Below the walkable hall the top is low and flat; beyond it, the cloud billows
//   up and its edge frays out. Shared physics is unchanged: souls walk at y = 0.
// - The cloud is described in the decor's local units; the camera and the scene
//   depth are in the world (office metres), turned local through the frame.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { ArenaFrame } from './arena-frame.ts';
import { CLOUD_NOISE_GLSL, SKY_LOOK, SUN_DIRECTION } from './purgatory-clouds.ts';
import type { CloudFloorSpec } from './purgatory-clouds.ts';

/** Height of the mist's top over the walkable hall (scene units; a soul is 2.46). */
export const FLOOR_MIST = Object.freeze({
  /** Where the mist starts (thin) and where it is fully dense, above the floor. */
  top: 0.95,
  dense: -0.35,
  /** Margin around the hall before the cloud billows up, and their height. */
  margin: 2.5,
  billows: 3,
  /** Lowest point of the cloud's belly. */
  bottom: -7,
});
/** Resolution of the floor pass, per screen axis. */
export const FLOOR_LAYER_SCALE = 0.4;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform float hasDepth;
uniform vec2 depthTexel;
uniform float logRange;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform vec3 eye;
uniform float localScale; // local units per world unit
uniform float time;
uniform vec4 hall;   // minX, maxX, minZ, maxZ (flat top)
uniform vec4 extent; // minX, maxX, minZ, maxZ (whole cloud)
uniform vec4 mist;   // top, dense, billows, bottom
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 shade;
uniform vec3 tint;
varying vec2 vUv;
#include <common>
${CLOUD_NOISE_GLSL}

// Distance from p to the rectangle r (0 inside).
float outside(vec2 p, vec4 r) {
  vec2 d = max(vec2(r.x - p.x, r.z - p.y), vec2(p.x - r.y, p.y - r.w));
  return length(max(d, 0.0));
}
// Signed distance to the rectangle r (negative inside).
float boxSd(vec2 p, vec4 r) {
  vec2 c = vec2(r.x + r.y, r.z + r.w) * 0.5, h = vec2(r.y - r.x, r.w - r.z) * 0.5;
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// Top of the cloud at (x, z): low mist over the hall, billows beyond it.
float topAt(vec2 xz) {
  float out_ = outside(xz, hall);
  float rise = smoothstep(0.0, 5.0, out_);
  float lumps = noise(vec3(xz * 0.22, time * 0.03));
  return mist.x + 0.25 * (lumps - 0.5) + rise * mist.z * (0.55 + 0.45 * lumps);
}
float density(vec3 p, int octaves) {
  float top = topAt(p.xz);
  float layer = smoothstep(top, top - (mist.x - mist.y), p.y);
  float belly = smoothstep(mist.w, mist.w + 2.5, p.y);
  float edge = 1.0 - smoothstep(-3.0, 1.5, boxSd(p.xz, extent) + (noise(vec3(p.xz * 0.15, 3.0)) - 0.5) * 6.0);
  vec3 n = p * vec3(0.55, 0.9, 0.55) + vec3(time * 0.05, -time * 0.02, time * 0.03);
  float puffs = fbm(n, octaves) - 0.5;
  // Noise only shapes the top band: nothing floats above top + 0.45.
  float band = smoothstep(top + 0.45, top - 0.25, p.y);
  return clamp((layer * 1.4 + puffs * 1.2) * band * belly * edge, 0.0, 1.0);
}
// View distance stored in the logarithmic depth buffer (as src/toon.ts reads it).
float sceneDepth(vec2 uv) {
  if (hasDepth < 0.5) return 1e6;
  // The farthest of four depth samples spread over this layer pixel.
  float d = max(max(texture2D(tDepth, uv).x, texture2D(tDepth, uv + vec2(depthTexel.x, 0.0)).x),
                max(texture2D(tDepth, uv + vec2(0.0, depthTexel.y)).x, texture2D(tDepth, uv + depthTexel).x));
  if (d >= 0.99999) return 1e6;
  return exp2(d * logRange) - 1.0;
}
void main() {
  vec4 view = projectionInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 viewDir = normalize(view.xyz / view.w);
  vec3 rd = normalize(mat3(cameraWorld) * viewDir);
  // Distance along the ray to the nearest opaque surface.
  float tScene = sceneDepth(vUv - depthTexel * 0.5) * localScale / max(-viewDir.z, 1e-4);
  float yTop = mist.x + mist.z + 0.5;
  // Slab [bottom, yTop].
  float t0, t1;
  if (abs(rd.y) < 1e-5) {
    if (eye.y > yTop || eye.y < mist.w) discard;
    t0 = 0.0; t1 = 200.0;
  } else {
    float a = (yTop - eye.y) / rd.y, b = (mist.w - eye.y) / rd.y;
    t0 = max(min(a, b), 0.0); t1 = max(a, b);
  }
  t1 = min(min(t1, tScene), 160.0);
  if (t0 >= t1) discard;
  vec3 L = normalize(sunDir);
  float mu = dot(rd, L);
  float phase = hg(mu, 0.55) * 0.7 + hg(mu, -0.3) * 0.3;
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  float t = t0 + 0.15 * hash3(vec3(gl_FragCoord.xy, fract(time)));
  for (int i = 0; i < 64; i++) {
    if (alpha > 0.97 || t > t1) break;
    vec3 p = eye + rd * t;
    // Above the cloud's surface here: jump down to it (empty-space skipping),
    // so that far rays still reach the cloud within the step budget.
    float surface = topAt(p.xz) + 0.5;
    if (p.y > surface) {
      if (rd.y > -0.002 && p.y > yTop) break;
      t += rd.y < -0.002 ? clamp((p.y - surface) / -rd.y, 0.1, 12.0) : 1.0;
      continue;
    }
    float dt = 0.1 + 0.03 * t;
    float d = density(p, 3);
    if (d > 0.01) {
      float toward = 1.8 * density(p + L * 0.7, 1);
      float beer = exp(-toward * 1.6);
      float powder = 1.0 - exp(-d * 5.0);
      float light = beer * mix(1.0, powder, 0.4);
      // Deeper in the cloud, bluer.
      float depthShade = smoothstep(mist.w, mist.x, p.y);
      vec3 c = mix(shade, tint, light * (0.55 + 0.45 * depthShade)) + sunColor * (phase + 0.22) * light;
      c += sunColor * pow(max(mu, 0.0), 6.0) * (1.0 - d) * 0.4;
      float a = 1.0 - exp(-d * min(dt, t1 - t) * 3.2);
      color += c * a * (1.0 - alpha);
      alpha += a * (1.0 - alpha);
    }
    t += dt;
  }
  // A ray that reaches the dense layer (inside the cloud's extent) before any
  // opaque surface without filling up: the rest is cloud, never a hole to the sky.
  if (alpha < 0.97 && rd.y < 0.0) {
    float tDense = (mist.y - eye.y) / rd.y;
    vec3 under = eye + rd * tDense;
    if (tDense > 0.0 && tDense < tScene && boxSd(under.xz, extent) < -3.0) {
      // Lit like the mist's surface seen from afar.
      color += (mix(shade, tint, 0.8) + sunColor * 0.2) * (1.0 - alpha);
      alpha = 1.0;
    }
  }
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
}`;

// Composite of the half-resolution layer (premultiplied, linear) over the frame.
const COMPOSITE = /* glsl */ `
uniform sampler2D tLayer;
varying vec2 vUv;
void main() {
  vec4 layer = texture2D(tLayer, vUv);
  if (layer.a < 0.003) discard;
  gl_FragColor = vec4(layer.rgb / layer.a, layer.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface FloorCloud {
  /**
   * Draw the floor cloud over the current frame, for `camera`, stopping at the
   * scene depth `depth` (the cartoon renderer's target; null: no occlusion).
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: THREE.Texture | null): void;
  dispose(): void;
}

export function createFloorCloud(
  T: Three,
  hall: CloudFloorSpec,
  extent: CloudFloorSpec,
  frame: ArenaFrame | null = null,
): FloorCloud {
  const rect = (r: CloudFloorSpec) => new T.Vector4(r.minX, r.maxX, r.minZ, r.maxZ);
  const uniforms = {
    tDepth: { value: null as THREE.Texture | null },
    hasDepth: { value: 0 },
    depthTexel: { value: new T.Vector2() },
    logRange: { value: 1 },
    projectionInverse: { value: new T.Matrix4() },
    cameraWorld: { value: new T.Matrix4() },
    eye: { value: new T.Vector3() },
    localScale: { value: frame ? 1 / frame.unit : 1 },
    time: { value: 0 },
    hall: { value: rect(hall) },
    extent: { value: rect(extent) },
    mist: {
      value: new T.Vector4(FLOOR_MIST.top, FLOOR_MIST.dense, FLOOR_MIST.billows, FLOOR_MIST.bottom),
    },
    sunDir: { value: new T.Vector3(...SUN_DIRECTION).normalize() },
    sunColor: { value: new T.Color(SKY_LOOK.sun) },
    shade: { value: new T.Color(SKY_LOOK.shade) },
    tint: { value: new T.Color(SKY_LOOK.cloud) },
  };
  // The margin before the billows: the hall grown on every side.
  uniforms.hall.value.add(
    new T.Vector4(-FLOOR_MIST.margin, FLOOR_MIST.margin, -FLOOR_MIST.margin, FLOOR_MIST.margin),
  );
  const march = new T.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    // Premultiplied accumulation into the cleared layer.
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.ZeroFactor,
  });
  const composite = new T.ShaderMaterial({
    uniforms: { tLayer: { value: null as THREE.Texture | null } },
    vertexShader: VERTEX,
    fragmentShader: COMPOSITE,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const quad = (material: THREE.Material) => {
    const scene = new T.Scene();
    const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return scene;
  };
  const marchScene = quad(march),
    compositeScene = quad(composite),
    screen = new T.Camera();
  let target: THREE.WebGLRenderTarget | null = null;
  const size = new T.Vector2(),
    clear = new T.Color();
  const start = performance.now();
  return {
    render(renderer, camera, depth) {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.round(size.x * FLOOR_LAYER_SCALE)),
        h = Math.max(1, Math.round(size.y * FLOOR_LAYER_SCALE));
      if (!target) target = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
      else if (target.width !== w || target.height !== h) target.setSize(w, h);
      camera.updateMatrixWorld();
      const perspective = camera as THREE.PerspectiveCamera;
      uniforms.tDepth.value = depth;
      uniforms.hasDepth.value = depth ? 1 : 0;
      // Spread of the depth samples: most of one layer pixel.
      uniforms.depthTexel.value.set(0.6 / w, 0.6 / h);
      uniforms.logRange.value = Math.log2((perspective.far ?? 1000) + 1);
      uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraWorld.value.copy(camera.matrixWorld);
      uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
      if (frame)
        uniforms.eye.value
          .sub(new T.Vector3(frame.originX, frame.originY, frame.originZ))
          .divideScalar(frame.unit);
      uniforms.time.value = (performance.now() - start) / 1000;
      const previous = renderer.getRenderTarget(),
        alpha = renderer.getClearAlpha(),
        autoClear = renderer.autoClear;
      renderer.getClearColor(clear);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(marchScene, screen);
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      composite.uniforms.tLayer.value = target.texture;
      renderer.autoClear = false;
      renderer.render(compositeScene, screen);
      renderer.autoClear = autoClear;
    },
    dispose() {
      target?.dispose();
      march.dispose();
      composite.dispose();
    },
  };
}
