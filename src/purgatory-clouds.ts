// The purgatory's sky (docs/purgatory-scene.md): a blue dome, the cloud the
// furniture stands on, and a few volumetric clouds drifting around it.
// - The sky dome is a gradient material (zenith, horizon, haze below), written in TSL.
// - The ground cloud is a flat walkable top edged with puffs, lit by the
//   cartoon shading like every other object.
// - The sky clouds are raymarched in a TSL fragment shader, each inside its own box:
//   noise density, a short march toward the sun, Beer-powder absorption,
//   two-lobe Henyey-Greenstein phase and a silver lining. They are drawn at
//   half resolution into their own target (SkyClouds.render), before the
//   frame, and the dome composites that layer behind everything else: the
//   clouds never stand in front of the ground cloud or the furniture.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { cloudNodes } from './cloud-nodes.ts';
import { tsl, type Node } from './gpu-passes.ts';

/** Colours of the sky (linear tints are derived by three.js from sRGB). */
export const SKY_LOOK = Object.freeze({
  zenith: '#2f7fd8',
  horizon: '#a9d6fb',
  sun: '#fff6df',
  fog: '#bfe0fb',
  cloud: '#e4ebf4',
  shade: '#a3badb',
});
/** World direction toward the sun (shared by the light and the clouds). */
export const SUN_DIRECTION = Object.freeze([0.35, 0.8, 0.48]);

// ------------------------------------------------------------------ dome

export interface SkyDome {
  mesh: THREE.Mesh;
  /** Show this cloud layer (screen-sized, premultiplied) behind the scene. */
  setClouds(layer: THREE.Texture | null, width: number, height: number): void;
}
/** A sphere drawn behind everything, following the camera (call follow()). */
export function createSkyDome(T: Three, radius: number): SkyDome {
  const look = SKY_LOOK;
  const {
    uniform,
    texture,
    vec4,
    float,
    positionLocal,
    screenUV,
    mix,
    smoothstep,
    pow,
    select,
    max,
  } = tsl(T);
  const uniforms = {
    zenith: uniform(new T.Color(look.zenith)),
    horizon: uniform(new T.Color(look.horizon)),
    sunColor: uniform(new T.Color(look.sun)),
    sunDir: uniform(new T.Vector3(...SUN_DIRECTION).normalize()),
    hasClouds: uniform(0),
  };
  const clouds = texture(new T.Texture());
  const dir = positionLocal.normalize();
  const up = dir.y;
  // Blue all around, below the horizon too (docs/purgatory-sky.md): the sky has no
  // ground, and the office's clouds only show by whitening the view near them.
  const sky = mix(uniforms.horizon, uniforms.zenith, pow(smoothstep(0, 1, up.abs()), 0.65));
  const sun = max(dir.dot(uniforms.sunDir.normalize()), 0);
  const lit = sky.add(uniforms.sunColor.mul(pow(sun, 900).mul(1.6).add(pow(sun, 12).mul(0.18))));
  // Cloud layer (premultiplied colour, linear) over the sky.
  // screenUV and render-target rows both run top to bottom.
  const layer = clouds.sample(screenUV);
  const final = select(
    uniforms.hasClouds.greaterThan(0.5),
    lit.mul(float(1).sub(layer.a)).add(layer.rgb),
    lit,
  );
  const material = new T.NodeMaterial();
  material.fragmentNode = vec4(final, 1);
  material.side = T.BackSide;
  material.depthWrite = false;
  material.fog = false;
  const mesh = new T.Mesh(new T.SphereGeometry(radius, 32, 16), material);
  mesh.name = 'purgatoire-ciel';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_r, _s, camera) => mesh.position.copy(camera.position);
  return {
    mesh,
    setClouds(layer, _width, _height) {
      if (layer) clouds.value = layer;
      uniforms.hasClouds.value = layer ? 1 : 0;
    },
  };
}

/**
 * The sky's haze as a fog node (WebGPU): things melt into the sky's own colour in
 * their direction (the dome's gradient), with distance (`near` to `far`) and below
 * the sky floor (`floor`, over `depth`): what lies under the office's clouds never
 * shows from the sky, which stays blue all around.
 */
export function createSkyFog(T: Three, near: number, far: number, floor: number, depth: number) {
  const { uniform, positionWorld, cameraPosition, mix, smoothstep, pow, max, fog } = tsl(T);
  const zenith = uniform(new T.Color(SKY_LOOK.zenith)),
    horizon = uniform(new T.Color(SKY_LOOK.horizon));
  const ray = positionWorld.sub(cameraPosition);
  const up = ray.normalize().y;
  const color = mix(horizon, zenith, pow(smoothstep(0, 1, up.abs()), 0.65));
  const range = smoothstep(near, far, ray.length());
  const under = smoothstep(floor, floor - depth, positionWorld.y);
  return fog(color, max(range, under));
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
    renderer: THREE.WebGPURenderer,
    camera: THREE.Camera,
  ): { texture: THREE.Texture; width: number; height: number };
}
/**
 * Raymarched cumulus filling one box: the TSL fragment shader of a cloud with these
 * (shared and per-cloud) uniform nodes. The box is drawn from the inside (back faces).
 */
function cloudMaterial(
  T: Three,
  shared: Record<'time' | 'sunColor' | 'shade' | 'tint', Node>,
  seed: number,
  sunLocal: THREE.Vector3,
): THREE.NodeMaterial {
  const {
    Fn,
    If,
    Break,
    Discard,
    Loop,
    uniform,
    vec3,
    vec4,
    float,
    positionLocal,
    cameraPosition,
    modelWorldMatrixInverse,
    screenCoordinate,
    smoothstep,
    mix,
    max,
    min,
    exp,
    pow,
  } = tsl(T);
  const { hash3, fbm, hg } = cloudNodes(T);
  const sunDir = uniform(sunLocal);
  const density = uniform(1.6);
  const fade = uniform(1);
  // Cumulus: a dome with a flatter base, eroded by noise.
  const cloud = (p: Node, octaves: number): Node => {
    const body = float(1).sub(p.mul(vec3(2, 2.4, 2)).length());
    const base = smoothstep(-0.42, -0.22, p.y);
    const n = p
      .mul(3.2)
      .add(vec3(seed * 7, 0, seed * 3))
      .add(vec3(shared.time.mul(0.02), 0, shared.time.mul(0.012)));
    const d = body.add(fbm(n, octaves).sub(0.5).mul(0.9));
    return d.mul(base).mul(density).clamp(0, 1);
  };
  const STEPS = 22;
  const march = Fn(() => {
    // Ray in the box's frame (unit cube, centred).
    const origin = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
    const rd = positionLocal.sub(origin).normalize();
    const inv = vec3(1).div(rd);
    const a = vec3(-0.5).sub(origin).mul(inv),
      b = vec3(0.5).sub(origin).mul(inv);
    const lo = min(a, b),
      hi = max(a, b);
    const near = max(max(max(lo.x, lo.y), lo.z), 0).toVar();
    const far = min(min(hi.x, hi.y), hi.z);
    const dt = far.sub(near).div(STEPS);
    const s = near.add(dt.mul(hash3(vec3(screenCoordinate.xy, shared.time)))).toVar();
    const L = sunDir.normalize();
    const mu = rd.dot(L);
    const phase = hg(mu, 0.55).mul(0.7).add(hg(mu, -0.3).mul(0.3));
    const color = vec3(0).toVar();
    const alpha = float(0).toVar();
    Loop(STEPS, () => {
      If(alpha.greaterThan(0.97).or(s.greaterThan(far)), () => {
        Break();
      });
      const p = origin.add(rd.mul(s));
      const d = cloud(p, 3);
      If(d.greaterThan(0.01), () => {
        const toward = cloud(p.add(L.mul(0.12)), 2)
          .add(cloud(p.add(L.mul(0.24)), 2))
          .mul(1.5);
        const beer = exp(toward.mul(-2.4));
        const powder = float(1).sub(exp(d.mul(-6)));
        const light = beer.mul(mix(1, powder, 0.5));
        const c = mix(shared.shade, shared.tint, light)
          .add(shared.sunColor.mul(phase).mul(light).mul(1.3))
          // Silver lining on thin edges facing the sun.
          .add(
            shared.sunColor
              .mul(pow(max(mu, 0), 6))
              .mul(float(1).sub(d))
              .mul(0.6),
          );
        const a2 = float(1).sub(exp(d.mul(dt).mul(-22)));
        color.addAssign(c.mul(a2).mul(float(1).sub(alpha)));
        alpha.addAssign(a2.mul(float(1).sub(alpha)));
      });
      s.addAssign(dt);
    });
    If(alpha.lessThan(0.004), () => {
      Discard();
    });
    return vec4(color.div(max(alpha, 1e-4)), alpha.mul(fade));
  });
  const material = new T.NodeMaterial();
  material.fragmentNode = march();
  material.transparent = true;
  material.depthWrite = false;
  material.side = T.BackSide;
  material.fog = false;
  return material;
}

/** Raymarched clouds, one box each (drawn after the opaque scene). */
export function createSkyClouds(T: Three, specs: readonly SkyCloudSpec[] = SKY_CLOUDS): SkyClouds {
  const group = new T.Group();
  group.name = 'purgatoire-nuages-ciel';
  const layerScene = new T.Scene();
  layerScene.add(group);
  let target: THREE.RenderTarget | null = null;
  const size = new T.Vector2(),
    clear = new T.Color();
  const box = new T.BoxGeometry(1, 1, 1);
  const sun = new T.Vector3(...SUN_DIRECTION).normalize();
  const { uniform } = tsl(T);
  const shared = {
    time: uniform(0),
    sunColor: uniform(new T.Color(SKY_LOOK.sun)),
    shade: uniform(new T.Color(SKY_LOOK.shade)),
    tint: uniform(new T.Color(SKY_LOOK.cloud)),
  };
  specs.forEach((c, i) => {
    // The box is only scaled: the sun direction in its frame.
    const material = cloudMaterial(
      T,
      shared,
      i * 1.37 + 0.5,
      new T.Vector3(sun.x * c.w, sun.y * c.h, sun.z * c.d).normalize(),
    );
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
      if (!target) target = new T.RenderTarget(w, h, { type: T.HalfFloatType });
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
