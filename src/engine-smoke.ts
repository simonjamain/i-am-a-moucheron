// Damaged aircraft trail small smoke puffs from their engine(s), denser,
// bigger and darker as their hit points drop. Purely visual: damage no longer
// changes the shape of any aircraft. One point cloud (one draw call) holds
// every puff; puffs stay where they were emitted, so a moving aircraft leaves
// a trail behind it.
import type * as THREE from 'three';
import { ACTOR_UNIT } from './scale.ts';
import type { Three } from './types.ts';

export const SMOKE_THRESHOLD = 0.15; // damage ratio below which nothing is emitted
export const SMOKE_CAPACITY = 1500;

// Damage ratio in [0, 1] from current and maximum hit points.
export function damageRatio(hp: number, maxHP: number): number {
  if (!(maxHP > 0) || !Number.isFinite(hp)) return 0;
  return Math.max(0, Math.min(1, 1 - hp / maxHP));
}

// Puffs per second, per engine: none when nearly intact, then steadily more.
export function smokeRate(damage: number): number {
  if (!(damage > SMOKE_THRESHOLD)) return 0;
  const t = (damage - SMOKE_THRESHOLD) / (1 - SMOKE_THRESHOLD);
  return 2 + 24 * t ** 1.2;
}

// Look of a puff for a damage level: sizes in model units (× ACTOR_UNIT in
// the world), lifetime in seconds, grey level from light grey to near black.
export interface SmokeLook {
  startSize: number;
  endSize: number;
  life: number;
  shade: number;
  opacity: number;
}
export function smokeLook(damage: number): SmokeLook {
  const t = Math.max(0, Math.min(1, (damage - SMOKE_THRESHOLD) / (1 - SMOKE_THRESHOLD)));
  return {
    startSize: 0.4 + 0.5 * t,
    endSize: 1.4 + 2.2 * t,
    life: 1 + 1.6 * t,
    shade: 0.75 - 0.62 * t,
    opacity: 0.45 + 0.35 * t,
  };
}

// Where the engines are: behind each propeller, or under the main rotor.
export function engineAnchors(T: Three, model: THREE.Object3D): THREE.Object3D[] {
  if (model.userData.engines) return model.userData.engines;
  const sources: [THREE.Object3D, [number, number, number]][] = model.userData.rotor
    ? [[model.userData.rotor, [0, -0.25, 0.8]]]
    : (model.userData.props || [model.userData.prop])
        .filter((prop: THREE.Object3D | undefined) => prop?.parent === model)
        .map((prop: THREE.Object3D) => [prop, [0, 0.12, 0.6]]);
  const engines = sources.map(([pivot, offset]) => {
    const anchor = new T.Object3D();
    anchor.name = 'engine-smoke';
    anchor.position.copy(pivot.position).add(new T.Vector3(...offset));
    model.add(anchor);
    return anchor;
  });
  model.userData.engines = engines;
  return engines;
}

const vertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float size;
  attribute float alpha;
  attribute float shade;
  uniform float scale;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mv.z, 1e-6);
    vAlpha = alpha;
    vShade = shade;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const fragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vAlpha;
  varying float vShade;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(vShade), vAlpha * (1.0 - r * r));
  }`;

interface SmokePuff extends SmokeLook {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
}
export interface EngineSmokeOptions {
  capacity?: number;
  random?: () => number;
}

export class EngineSmoke {
  T: Three;
  capacity: number;
  random: () => number;
  puffs: SmokePuff[];
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  shades: Float32Array;
  material: THREE.ShaderMaterial;
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(
    T: Three,
    scene: THREE.Object3D,
    { capacity = SMOKE_CAPACITY, random = Math.random }: EngineSmokeOptions = {},
  ) {
    this.T = T;
    this.capacity = capacity;
    this.random = random;
    this.puffs = [];
    const geometry = new T.BufferGeometry();
    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.shades = new Float32Array(capacity);
    geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
    geometry.setAttribute('size', new T.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new T.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('shade', new T.BufferAttribute(this.shades, 1));
    geometry.setDrawRange(0, 0);
    this.material = new T.ShaderMaterial({
      uniforms: { scale: { value: 1 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.points = new T.Points(geometry, this.material);
    this.points.name = 'engine-smoke';
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  // Emit for one aircraft this frame, according to its damage ratio.
  emit(model: THREE.Object3D, damage: number, dt: number): number {
    const rate = smokeRate(damage);
    const memory = model.userData;
    if (!rate || !(dt > 0)) {
      memory.smokeCarry = 0;
      return 0;
    }
    const engines = engineAnchors(this.T, model);
    if (!engines.length) return 0;
    const look = smokeLook(damage);
    memory.smokeCarry = (memory.smokeCarry || 0) + rate * dt;
    let emitted = 0;
    model.updateWorldMatrix(true, false);
    while (memory.smokeCarry >= 1) {
      memory.smokeCarry--;
      for (const engine of engines) {
        if (this.puffs.length >= this.capacity) this.puffs.shift();
        const jitter = () => (this.random() - 0.5) * 0.3 * ACTOR_UNIT;
        const p = engine.getWorldPosition(new this.T.Vector3());
        p.x += jitter();
        p.y += jitter();
        p.z += jitter();
        this.puffs.push({
          p,
          v: new this.T.Vector3(jitter(), (0.6 + this.random() * 0.5) * ACTOR_UNIT, jitter()),
          age: 0,
          ...look,
          life: look.life * (0.8 + this.random() * 0.4),
        });
        emitted++;
      }
    }
    return emitted;
  }

  // Age, drift and upload every puff; `scale` makes sizes perspective-correct.
  update(dt: number, camera: THREE.Camera | null | undefined, viewportHeight: number): number {
    this.puffs = this.puffs.filter((puff) => (puff.age += dt) < puff.life);
    this.puffs.forEach((puff, i) => {
      puff.p.addScaledVector(puff.v, dt);
      const t = puff.age / puff.life;
      this.positions.set([puff.p.x, puff.p.y, puff.p.z], i * 3);
      this.sizes[i] = (puff.startSize + (puff.endSize - puff.startSize) * t) * ACTOR_UNIT;
      this.alphas[i] = puff.opacity * (1 - t) ** 1.5;
      this.shades[i] = puff.shade;
    });
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.puffs.length);
    for (const name of ['position', 'size', 'alpha', 'shade'])
      geometry.attributes[name].needsUpdate = true;
    if ((camera as THREE.PerspectiveCamera | null | undefined)?.isPerspectiveCamera)
      this.material.uniforms.scale.value =
        viewportHeight /
        (2 * Math.tan(this.T.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2));
    return this.puffs.length;
  }

  clear(): void {
    this.puffs = [];
    this.points.geometry.setDrawRange(0, 0);
  }
}
