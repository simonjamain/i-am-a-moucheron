// The purgatory's sky (docs/purgatory-scene.md): a blue dome, the cloud the
// furniture stands on, and a few volumetric clouds drifting around it.
// - The sky dome is a gradient shader (zenith, horizon, haze below).
// - The ground cloud is a flat walkable top edged with puffs, lit by the
//   cartoon shading like every other object.
// - The sky clouds are raymarched in WebGL2, each inside its own box:
//   noise density, a short march toward the sun, Beer-powder absorption,
//   two-lobe Henyey-Greenstein phase and a silver lining. They are drawn at
//   half resolution into their own target (SkyClouds.render), before the
//   frame, and the dome composites that layer behind everything else: the
//   clouds never stand in front of the ground cloud or the furniture.
import type * as THREE from 'three';
import type { Three } from './types.ts';

/** Colours of the sky (linear tints are derived by three.js from sRGB). */
export const SKY_LOOK = Object.freeze({
  zenith: '#2f7fd8',
  horizon: '#a9d6fb',
  below: '#e3f1fd',
  sun: '#fff6df',
  fog: '#bfe0fb',
  cloud: '#e4ebf4',
  shade: '#a3badb',
});
/** World direction toward the sun (shared by the light and the clouds). */
export const SUN_DIRECTION = Object.freeze([0.35, 0.8, 0.48]);

// ------------------------------------------------------------------ dome
const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const DOME_FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 below;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform sampler2D clouds;
uniform vec2 screen;
uniform float hasClouds;
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 c = up > 0.0
    ? mix(horizon, zenith, pow(smoothstep(0.0, 1.0, up), 0.65))
    : mix(horizon, below, smoothstep(0.0, -0.35, up));
  float sun = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (pow(sun, 900.0) * 1.6 + pow(sun, 12.0) * 0.18);
  // Cloud layer (premultiplied colour, linear) over the sky.
  if (hasClouds > 0.5) {
    vec4 layer = texture2D(clouds, gl_FragCoord.xy / screen);
    c = c * (1.0 - layer.a) + layer.rgb;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyDome {
  mesh: THREE.Mesh;
  /** Show this cloud layer (screen-sized, premultiplied) behind the scene. */
  setClouds(layer: THREE.Texture | null, width: number, height: number): void;
}
/** A sphere drawn behind everything, following the camera (call follow()). */
export function createSkyDome(T: Three, radius: number): SkyDome {
  const look = SKY_LOOK;
  const uniforms = {
    zenith: { value: new T.Color(look.zenith) },
    horizon: { value: new T.Color(look.horizon) },
    below: { value: new T.Color(look.below) },
    sunColor: { value: new T.Color(look.sun) },
    sunDir: { value: new T.Vector3(...SUN_DIRECTION).normalize() },
    clouds: { value: null as THREE.Texture | null },
    screen: { value: new T.Vector2(1, 1) },
    hasClouds: { value: 0 },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: T.BackSide,
    depthWrite: false,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(radius, 32, 16), material);
  mesh.name = 'purgatoire-ciel';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, _s, camera) => mesh.position.copy(camera.position);
  return {
    mesh,
    setClouds(layer, width, height) {
      uniforms.clouds.value = layer;
      uniforms.hasClouds.value = layer ? 1 : 0;
      uniforms.screen.value.set(width, height);
    },
  };
}

// ------------------------------------------------------------ ground cloud
/** Deterministic pseudo-random in [0, 1) (same decor for every player). */
export function seeded(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Vertical flattening (1: sphere). */
  squash: number;
}
/** Walkable rectangle of the ground cloud (scene units) and its margin. */
export interface CloudFloorSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
/**
 * The puffs that make the ground cloud: a rim of large flattened balls along
 * the edge (their tops rise a little above the floor), a lower ring under it
 * and a belly hanging below. Pure function, tested in scripts/test-purgatory-scene.mjs.
 */
export function cloudPuffs(spec: CloudFloorSpec): Puff[] {
  const out: Puff[] = [];
  const w = spec.maxX - spec.minX,
    d = spec.maxZ - spec.minZ;
  const perimeter = 2 * (w + d);
  let seed = 1;
  const rnd = () => seeded(seed++);
  // Point along the rectangle's edge at arc length s.
  const edge = (s: number): [number, number, number, number] => {
    s = ((s % perimeter) + perimeter) % perimeter;
    if (s < w) return [spec.minX + s, spec.minZ, 0, -1];
    s -= w;
    if (s < d) return [spec.maxX, spec.minZ + s, 1, 0];
    s -= d;
    if (s < w) return [spec.maxX - s, spec.maxZ, 0, 1];
    s -= w;
    return [spec.minX, spec.maxZ - s, -1, 0];
  };
  for (const [step, out_, y, r0, r1, squash] of [
    [2.6, 0.4, -0.55, 1.6, 2.8, 0.62], // rim, tops just above the floor
    [3.4, 1.8, -1.6, 2.2, 3.4, 0.7], // lower ring
  ] as const)
    for (let s = 0; s < perimeter; s += step * (0.75 + 0.5 * rnd())) {
      const [x, z, nx, nz] = edge(s);
      const push = out_ * (0.6 + 0.8 * rnd());
      out.push({
        x: x + nx * push,
        y: y + (rnd() - 0.5) * 0.5,
        z: z + nz * push,
        r: r0 + (r1 - r0) * rnd(),
        squash,
      });
    }
  // Margin: small half-buried puffs between the hall and the rim, on both long sides.
  for (let z = spec.minZ + 2; z < spec.maxZ - 2; z += 2.2)
    for (const side of [-1, 1]) {
      const inner = side < 0 ? spec.minX + 2.5 : spec.maxX - 2.5;
      out.push({
        x: inner - side * 2.2 * rnd(),
        y: -0.35 - 0.2 * rnd(),
        z: z + (rnd() - 0.5) * 1.5,
        r: 0.7 + 0.8 * rnd(),
        squash: 0.55,
      });
    }
  // Belly: big balls under the floor, deeper toward the middle.
  for (let x = spec.minX + 3; x <= spec.maxX - 3; x += 6)
    for (let z = spec.minZ + 3; z <= spec.maxZ - 3; z += 6) {
      const inner = Math.min(x - spec.minX, spec.maxX - x, z - spec.minZ, spec.maxZ - z);
      out.push({
        x: x + (rnd() - 0.5) * 3,
        y: -2.2 - Math.min(4, inner * 0.35) - rnd(),
        z: z + (rnd() - 0.5) * 3,
        r: 3.2 + 1.6 * rnd(),
        squash: 0.6,
      });
    }
  return out;
}

/** Smooth 2D value noise in [0, 1) (deterministic). */
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number) => seeded(a * 57.3 + b * 113.9);
  const top = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * ux;
  const bottom = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * ux;
  return top + (bottom - top) * uz;
}
/**
 * Height of the cloud's top at (x, z): flat (y = 0) on the walkable `hall`,
 * swelling into soft lumps beyond it, up to about 1.2 units at the rim.
 */
export function cloudHeight(x: number, z: number, hall: CloudFloorSpec): number {
  const out = Math.max(hall.minX - x, x - hall.maxX, hall.minZ - z, z - hall.maxZ, 0);
  if (out <= 0.4) return 0;
  const rise = Math.min(1, (out - 0.4) / 4);
  const lumps = 0.35 + 0.65 * noise2(x * 0.35, z * 0.35);
  return rise * rise * (3 - 2 * rise) * 1.2 * lumps;
}

/**
 * The cloud the purgatory stands on: a top flat on the walkable `hall` and
 * lumpy around it, with a soft white-to-blue mottling, edged with puffs.
 */
export function createCloudFloor(
  T: Three,
  spec: CloudFloorSpec,
  hall: CloudFloorSpec,
): THREE.Group {
  const group = new T.Group();
  group.name = 'purgatoire-nuage';
  const material = new T.MeshStandardMaterial({ color: SKY_LOOK.cloud, roughness: 1 });
  const w = spec.maxX - spec.minX,
    d = spec.maxZ - spec.minZ;
  const grid = new T.PlaneGeometry(w, d, Math.ceil(w), Math.ceil(d));
  grid.rotateX(-Math.PI / 2);
  grid.translate((spec.minX + spec.maxX) / 2, 0, (spec.minZ + spec.maxZ) / 2);
  const position = grid.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const white = new T.Color(SKY_LOOK.cloud),
    blue = new T.Color(SKY_LOOK.shade),
    c = new T.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i);
    position.setY(i, cloudHeight(x, z, hall) - 0.02);
    const mottle = noise2(x * 0.18 + 40, z * 0.18) * 0.6 + noise2(x * 0.6, z * 0.6 + 9) * 0.4;
    const k = Math.min(1, Math.max(0, (mottle - 0.3) / 0.5));
    c.copy(white).lerp(blue, k * k * (3 - 2 * k) * 0.7);
    c.toArray(colors, i * 3);
  }
  grid.setAttribute('color', new T.BufferAttribute(colors, 3));
  grid.computeVertexNormals();
  const topMaterial = material.clone();
  topMaterial.color.set('#ffffff');
  topMaterial.vertexColors = true;
  const top = new T.Mesh(grid, topMaterial);
  top.name = 'purgatoire-nuage-sol';
  top.receiveShadow = true;
  group.add(top);
  const puffs = cloudPuffs(spec);
  const ball = new T.IcosahedronGeometry(1, 1);
  const mesh = new T.InstancedMesh(ball, material, puffs.length);
  mesh.name = 'purgatoire-nuage-boules';
  const m = new T.Matrix4(),
    q = new T.Quaternion(),
    p = new T.Vector3(),
    s = new T.Vector3();
  puffs.forEach((b, i) => {
    q.setFromAxisAngle(new T.Vector3(0, 1, 0), seeded(i + 50) * Math.PI);
    mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s.set(b.r, b.r * b.squash, b.r)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.size = { w, d };
  return group;
}

// -------------------------------------------------------- volumetric clouds
/** Shared GLSL of every volumetric cloud: value noise, fBm, Henyey-Greenstein. */
export const CLOUD_NOISE_GLSL = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
                 mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
                 mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int octaves) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}
`;
const CLOUD_VERTEX = /* glsl */ `
varying vec3 vOrigin;
varying vec3 vPos;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  // Ray in the box's frame (unit cube, centred).
  vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const CLOUD_FRAGMENT = /* glsl */ `
precision highp float;
uniform float time;
uniform float seed;
uniform vec3 sunLocal;
uniform vec3 sunColor;
uniform vec3 shade;
uniform vec3 tint;
uniform float density;
uniform float fade;
varying vec3 vOrigin;
varying vec3 vPos;
#include <common>
#include <logdepthbuf_pars_fragment>

${CLOUD_NOISE_GLSL}
// Cumulus: a dome with a flatter base, eroded by noise.
float cloud(vec3 p, int octaves) {
  float body = 1.0 - length(p * vec3(2.0, 2.4, 2.0));
  float base = smoothstep(-0.42, -0.22, p.y);
  vec3 n = p * 3.2 + vec3(seed * 7.0, 0.0, seed * 3.0) + vec3(time * 0.02, 0.0, time * 0.012);
  float d = body + (fbm(n, octaves) - 0.5) * 0.9;
  return clamp(d * base * density, 0.0, 1.0);
}
vec2 hitBox(vec3 o, vec3 d) {
  vec3 inv = 1.0 / d;
  vec3 a = (vec3(-0.5) - o) * inv, b = (vec3(0.5) - o) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vPos - vOrigin);
  vec2 t = hitBox(vOrigin, rd);
  t.x = max(t.x, 0.0);
  const int STEPS = 22;
  float dt = (t.y - t.x) / float(STEPS);
  float s = t.x + dt * hash3(vec3(gl_FragCoord.xy, time));
  vec3 L = normalize(sunLocal);
  float mu = dot(rd, L);
  float phase = hg(mu, 0.55) * 0.7 + hg(mu, -0.3) * 0.3;
  vec3 color = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < STEPS; i++) {
    if (alpha > 0.97 || s > t.y) break;
    vec3 p = vOrigin + rd * s;
    float d = cloud(p, 3);
    if (d > 0.01) {
      float toward = 0.0;
      for (int j = 1; j <= 2; j++) toward += 1.5 * cloud(p + L * 0.12 * float(j), 2);
      float beer = exp(-toward * 2.4);
      float powder = 1.0 - exp(-d * 6.0);
      float light = beer * mix(1.0, powder, 0.5);
      vec3 c = mix(shade, tint, light) + sunColor * phase * light * 1.3;
      // Silver lining on thin edges facing the sun.
      c += sunColor * pow(max(mu, 0.0), 6.0) * (1.0 - d) * 0.6;
      float a = 1.0 - exp(-d * dt * 22.0);
      color += c * a * (1.0 - alpha);
      alpha += a * (1.0 - alpha);
    }
    s += dt;
  }
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color / max(alpha, 1e-4), alpha * fade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyCloudSpec {
  x: number;
  y: number;
  z: number;
  /** Box size (scene units). */
  w: number;
  h: number;
  d: number;
}
/** Hand-placed clouds around the purgatory (scene units, cloud floor at y = 0). */
export const SKY_CLOUDS: readonly SkyCloudSpec[] = Object.freeze([
  { x: -55, y: 14, z: 10, w: 34, h: 16, d: 26 },
  { x: 62, y: 8, z: 30, w: 40, h: 18, d: 30 },
  { x: -48, y: -14, z: 70, w: 44, h: 18, d: 34 },
  { x: 40, y: 22, z: -40, w: 30, h: 14, d: 24 },
  { x: -20, y: 6, z: -60, w: 46, h: 20, d: 32 },
  { x: 70, y: -20, z: 95, w: 50, h: 22, d: 36 },
  { x: 8, y: -28, z: 130, w: 60, h: 22, d: 40 },
  { x: -80, y: 30, z: 40, w: 36, h: 16, d: 28 },
]);
/** Resolution of the cloud layer, per screen axis. */
export const CLOUD_LAYER_SCALE = 0.5;
export interface SkyClouds {
  group: THREE.Group;
  update(time: number): void;
  /**
   * Draw the clouds seen by `camera` into the half-resolution layer (call it
   * before the frame); returns the layer and the drawing buffer size.
   */
  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ): { texture: THREE.Texture; width: number; height: number };
}
/** Raymarched clouds, one box each (drawn after the opaque scene). */
export function createSkyClouds(T: Three, specs: readonly SkyCloudSpec[] = SKY_CLOUDS): SkyClouds {
  const group = new T.Group();
  group.name = 'purgatoire-nuages-ciel';
  const layerScene = new T.Scene();
  layerScene.add(group);
  let target: THREE.WebGLRenderTarget | null = null;
  const size = new T.Vector2(),
    clear = new T.Color();
  const box = new T.BoxGeometry(1, 1, 1);
  const sun = new T.Vector3(...SUN_DIRECTION).normalize();
  const shared = {
    time: { value: 0 },
    sunColor: { value: new T.Color(SKY_LOOK.sun) },
    shade: { value: new T.Color(SKY_LOOK.shade) },
    tint: { value: new T.Color(SKY_LOOK.cloud) },
  };
  specs.forEach((c, i) => {
    const material = new T.ShaderMaterial({
      uniforms: {
        ...shared,
        seed: { value: i * 1.37 + 0.5 },
        // The box is only scaled: the sun direction in its frame.
        sunLocal: {
          value: new T.Vector3(sun.x * c.w, sun.y * c.h, sun.z * c.d).normalize(),
        },
        density: { value: 1.6 },
        fade: { value: 1 },
      },
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: T.BackSide,
    });
    const mesh = new T.Mesh(box, material);
    mesh.name = 'purgatoire-nuage-ciel-' + i;
    mesh.position.set(c.x, c.y, c.z);
    mesh.scale.set(c.w, c.h, c.d);
    mesh.userData.base = mesh.position.clone();
    mesh.renderOrder = -5;
    group.add(mesh);
  });
  return {
    group,
    update(time) {
      shared.time.value = time;
      group.children.forEach((mesh, i) => {
        const base = mesh.userData.base as THREE.Vector3;
        mesh.position.x = base.x + Math.sin(time * 0.02 + i) * 4;
      });
    },
    render(renderer, camera) {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.round(size.x * CLOUD_LAYER_SCALE)),
        h = Math.max(1, Math.round(size.y * CLOUD_LAYER_SCALE));
      if (!target) target = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
      else if (target.width !== w || target.height !== h) target.setSize(w, h);
      const previous = renderer.getRenderTarget(),
        alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(layerScene, camera);
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      return { texture: target.texture, width: size.x, height: size.y };
    },
  };
}
