// One InstancedMesh per rigged species: its procedural cycle (src/rigged-creature.ts)
// is skinned once on the CPU into a vertex animation texture (positions and
// normals per frame, half floats) that the vertex shader samples per instance
// phase. Hundreds or thousands of animated creatures then cost one draw call
// and no per-instance skeleton. The optional shared clock (`time`) advances
// every instance together (midge wing beat); ground walkers keep time = 0 and
// drive their own phase from the distance they travel.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { tsl, type Node } from './gpu-passes.ts';

const TEXTURE_WIDTH = 1024;

/** Skinned cycle frames: positions and normals per frame, per vertex. */
export interface CreatureBake {
  frames: number;
  count: number;
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
}

/** Vertex animation texture built from a bake. */
export interface CreatureVat {
  texture: THREE.DataTexture;
  frames: number;
  count: number;
  height: number;
  bytes: number;
}

/** The part of a rigged creature (src/rigged-creature.ts) the batch uses. */
export interface BatchCreature {
  name: string;
  bake(T: Three): CreatureBake;
  bakeSteps(T: Three): Generator<unknown, CreatureBake, unknown>;
  geometry(T: Three): THREE.BufferGeometry;
  texture(T: Three): THREE.Texture | null;
}

export interface PrepareVatOptions {
  yieldControl?: () => Promise<unknown>;
  budgetMs?: number;
}

export interface CreatureBatchOptions {
  name?: string;
  shadows?: boolean;
  vat?: CreatureVat | null;
}

/** Uniform nodes of the vertex animation (each has a typed `.value`). */
interface VatUniforms {
  vatTime: { value: number };
  vatFrames: { value: number };
  vatCount: { value: number };
}

function* vatSteps(T: Three, bake: CreatureBake): Generator<undefined, CreatureVat, unknown> {
  const texels = bake.frames * bake.count;
  const height = Math.ceil((2 * texels) / TEXTURE_WIDTH);
  const data = new Uint16Array(TEXTURE_WIDTH * height * 4);
  for (let i = 0; i < texels; i++) {
    for (let a = 0; a < 3; a++) {
      data[i * 4 + a] = T.DataUtils.toHalfFloat(bake.positions[i * 3 + a]);
      data[(texels + i) * 4 + a] = T.DataUtils.toHalfFloat(bake.normals[i * 3 + a]);
    }
    if ((i + 1) % 1024 === 0) yield;
  }
  const texture = new T.DataTexture(data, TEXTURE_WIDTH, height, T.RGBAFormat, T.HalfFloatType);
  texture.minFilter = texture.magFilter = T.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, frames: bake.frames, count: bake.count, height, bytes: data.byteLength };
}

function createVat(T: Three, creature: BatchCreature): CreatureVat {
  const steps = vatSteps(T, creature.bake(T));
  let result: IteratorResult<undefined, CreatureVat>;
  do {
    result = steps.next();
  } while (!result.done);
  return result.value;
}

// Yield tasks, not just microtasks: the browser must be able to paint the loader.
export async function prepareCreatureVat(
  T: Three,
  creature: BatchCreature,
  {
    yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0)),
    budgetMs = 4,
  }: PrepareVatOptions = {},
): Promise<CreatureVat> {
  async function drain<R>(steps: Generator<unknown, R, unknown>): Promise<R> {
    let since = performance.now();
    while (true) {
      const result = steps.next();
      if (result.done) return result.value;
      if (performance.now() - since >= budgetMs) {
        await yieldControl();
        since = performance.now();
      }
    }
  }
  await yieldControl();
  const baked = await drain(creature.bakeSteps(T));
  await yieldControl();
  return drain(vatSteps(T, baked));
}

/**
 * Node material of a batch: position and normal come from the vertex animation texture
 * (frame by instance phase), then go through the instance's own matrix. The instance
 * matrices are read from the interleaved attribute `vatM` (four vec4 columns) because a
 * node material applies the instancing before `positionNode`, which replaces the position.
 */
function vatMaterial(
  T: Three,
  vat: CreatureVat,
  uniforms: VatUniforms,
  texture: THREE.Texture | null,
): THREE.MeshStandardNodeMaterial {
  const {
    uniform,
    texture: textureNode,
    attribute,
    int,
    ivec2,
    vec4,
    mat4,
    floor,
    fract,
    mod,
    mix,
    transformNormal,
    transformNormalToView,
  } = tsl(T);
  const frames = uniform(vat.frames),
    count = uniform(vat.count),
    time = uniform(0);
  uniforms.vatFrames = frames;
  uniforms.vatCount = count;
  uniforms.vatTime = time;
  const vatTexture = textureNode(vat.texture);
  const vertex = attribute('vatVertex', 'float'),
    phase = attribute('vatPhase', 'float');
  const fetch = (frame: Node, row: number) => {
    const i = frames.mul(count).mul(row).add(frame.mul(count)).add(vertex);
    const x = mod(i, TEXTURE_WIDTH),
      y = floor(i.div(TEXTURE_WIDTH));
    return vatTexture.load(ivec2(int(x), int(y))).xyz;
  };
  const sample = (row: number) => {
    const f = fract(time.add(phase)).mul(frames);
    const a = floor(f);
    return mix(fetch(a, row), fetch(mod(a.add(1), frames), row), f.sub(a));
  };
  const matrix = mat4(...[0, 1, 2, 3].map((k) => attribute('vatM' + k, 'vec4')));
  const material = new T.MeshStandardNodeMaterial({
    map: texture,
    roughness: 0.75,
    side: T.DoubleSide,
  });
  material.positionNode = matrix.mul(vec4(sample(0), 1)).xyz;
  material.normalNode = transformNormalToView(transformNormal(sample(1).normalize(), matrix));
  return material;
}

export class CreatureBatch {
  T: Three;
  scene: THREE.Object3D;
  creature: BatchCreature;
  name: string;
  capacity: number;
  count: number;
  mesh: THREE.InstancedMesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial> | null;
  vat: CreatureVat;
  geometry: THREE.InstancedBufferGeometry;
  uniforms: VatUniforms;
  material: THREE.MeshStandardNodeMaterial;
  shadows: boolean;
  phases?: THREE.InstancedBufferAttribute;
  matrixBuffer?: THREE.InstancedInterleavedBuffer;
  constructor(
    T: Three,
    scene: THREE.Object3D,
    creature: BatchCreature,
    { name = creature.name, shadows = false, vat = null }: CreatureBatchOptions = {},
  ) {
    this.T = T;
    this.scene = scene;
    this.creature = creature;
    this.name = name;
    this.capacity = 0;
    this.count = 0;
    this.mesh = null;
    this.vat = vat || createVat(T, creature);
    const source = creature.geometry(T);
    this.geometry = new T.InstancedBufferGeometry();
    this.geometry.setIndex(source.index);
    // Position is only read for bounds; the vertex shader fetches the VAT.
    this.geometry.setAttribute('position', source.attributes.position);
    this.geometry.setAttribute('normal', source.attributes.normal);
    this.geometry.setAttribute('uv', source.attributes.uv);
    this.geometry.setAttribute(
      'vatVertex',
      new T.BufferAttribute(
        Float32Array.from({ length: this.vat.count }, (_, i) => i),
        1,
      ),
    );
    this.uniforms = {} as VatUniforms;
    this.material = vatMaterial(T, this.vat, this.uniforms, creature.texture(T));
    this.shadows = shadows;
  }
  ensure(needed: number): void {
    if (this.capacity >= needed) return;
    let capacity = Math.max(64, this.capacity);
    while (capacity < needed) capacity *= 2;
    if (this.mesh) this.scene.remove(this.mesh);
    this.phases = new this.T.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.phases.setUsage(this.T.DynamicDrawUsage);
    this.geometry.setAttribute('vatPhase', this.phases);
    this.mesh = new this.T.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = this.name + '-meshy';
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.shadows;
    // The same instance matrices, as vertex attributes the material reads (see vatMaterial).
    this.matrixBuffer = new this.T.InstancedInterleavedBuffer(
      this.mesh.instanceMatrix.array,
      16,
      1,
    );
    this.matrixBuffer.setUsage(this.T.DynamicDrawUsage);
    for (let k = 0; k < 4; k++)
      this.geometry.setAttribute(
        'vatM' + k,
        new this.T.InterleavedBufferAttribute(this.matrixBuffer, 4, k * 4),
      );
    this.mesh.userData.projectileSolid = false;
    this.scene.add(this.mesh);
    this.capacity = capacity;
  }
  // begin(n) reserves room, add() fills instances in order, end() uploads.
  begin(expected: number): void {
    this.ensure(expected);
    this.count = 0;
  }
  add(matrix: THREE.Matrix4, phase: number): void {
    this.ensure(this.count + 1);
    this.mesh!.setMatrixAt(this.count, matrix);
    this.phases!.array[this.count] = phase;
    this.count++;
  }
  end(time = 0): void {
    if (!this.mesh) return;
    this.mesh.count = this.count;
    this.uniforms.vatTime.value = ((time % 1) + 1) % 1;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.matrixBuffer!.needsUpdate = true;
      this.phases!.needsUpdate = true;
    }
  }
  dispose(): void {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.capacity = 0;
    this.count = 0;
    this.material.dispose();
    this.vat.texture.dispose();
  }
}
