// One InstancedMesh per rigged species: its procedural cycle (src/rigged-creature.js)
// is skinned once on the CPU into a vertex animation texture (positions and
// normals per frame, half floats) that the vertex shader samples per instance
// phase. Hundreds or thousands of animated creatures then cost one draw call
// and no per-instance skeleton. The optional shared clock (`time`) advances
// every instance together (midge wing beat); ground walkers keep time = 0 and
// drive their own phase from the distance they travel.
import type * as THREE from 'three';
import type { Three } from './types.ts';

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

/** The part of a rigged creature (src/rigged-creature.js) the batch uses. */
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

interface VatUniforms {
  vatTexture: THREE.IUniform<THREE.DataTexture>;
  vatTime: THREE.IUniform<number>;
  vatFrames: THREE.IUniform<number>;
  vatCount: THREE.IUniform<number>;
  [uniform: string]: THREE.IUniform;
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

function vatShader(
  uniforms: VatUniforms,
): (shader: THREE.WebGLProgramParametersWithUniforms) => void {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2D vatTexture;
uniform float vatTime;
uniform float vatFrames;
uniform float vatCount;
attribute float vatVertex;
attribute float vatPhase;
vec3 vatFetch(float frame, float row) {
  int i = int(row * vatFrames * vatCount + frame * vatCount + vatVertex);
  return texelFetch(vatTexture, ivec2(i % ${TEXTURE_WIDTH}, i / ${TEXTURE_WIDTH}), 0).xyz;
}
vec3 vatSample(float row) {
  float f = fract(vatTime + vatPhase) * vatFrames;
  float a = floor(f);
  float b = mod(a + 1.0, vatFrames);
  return mix(vatFetch(a, row), vatFetch(b, row), f - a);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = normalize(vatSample(1.0));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif',
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vatSample(0.0);');
  };
}

export class CreatureBatch {
  T: Three;
  scene: THREE.Object3D;
  creature: BatchCreature;
  name: string;
  capacity: number;
  count: number;
  mesh: THREE.InstancedMesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial> | null;
  vat: CreatureVat;
  geometry: THREE.InstancedBufferGeometry;
  uniforms: VatUniforms;
  material: THREE.MeshStandardMaterial;
  shadows: boolean;
  depthMaterial?: THREE.MeshDepthMaterial;
  phases?: THREE.InstancedBufferAttribute;
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
    this.uniforms = {
      vatTexture: { value: this.vat.texture },
      vatTime: { value: 0 },
      vatFrames: { value: this.vat.frames },
      vatCount: { value: this.vat.count },
    };
    this.material = new T.MeshStandardMaterial({
      map: creature.texture(T),
      roughness: 0.75,
      side: T.DoubleSide,
    });
    this.material.customProgramCacheKey = () => 'vat-' + name;
    this.material.onBeforeCompile = vatShader(this.uniforms);
    this.shadows = shadows;
    if (shadows) {
      // Shadows need the same displacement in the depth pass.
      this.depthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
      this.depthMaterial.customProgramCacheKey = () => 'vat-depth-' + name;
      this.depthMaterial.onBeforeCompile = vatShader(this.uniforms);
    }
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
    if (this.depthMaterial) this.mesh.customDepthMaterial = this.depthMaterial;
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
      this.phases!.needsUpdate = true;
    }
  }
  dispose(): void {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.capacity = 0;
    this.count = 0;
    this.material.dispose();
    this.depthMaterial?.dispose();
    this.vat.texture.dispose();
  }
}
