// One InstancedMesh per rigged species: its procedural cycle (src/rigged-creature.js)
// is skinned once on the CPU into a vertex animation texture (positions and
// normals per frame, half floats) that the vertex shader samples per instance
// phase. Hundreds or thousands of animated creatures then cost one draw call
// and no per-instance skeleton. The optional shared clock (`time`) advances
// every instance together (midge wing beat); ground walkers keep time = 0 and
// drive their own phase from the distance they travel.
const TEXTURE_WIDTH = 1024;

function createVat(T, creature) {
  const bake = creature.bake(T);
  const texels = bake.frames * bake.count;
  const height = Math.ceil((2 * texels) / TEXTURE_WIDTH);
  const data = new Uint16Array(TEXTURE_WIDTH * height * 4);
  for (let i = 0; i < texels; i++)
    for (let a = 0; a < 3; a++) {
      data[i * 4 + a] = T.DataUtils.toHalfFloat(bake.positions[i * 3 + a]);
      data[(texels + i) * 4 + a] = T.DataUtils.toHalfFloat(bake.normals[i * 3 + a]);
    }
  const texture = new T.DataTexture(data, TEXTURE_WIDTH, height, T.RGBAFormat, T.HalfFloatType);
  texture.minFilter = texture.magFilter = T.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, frames: bake.frames, count: bake.count, height, bytes: data.byteLength };
}

function vatShader(uniforms) {
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
  constructor(T, scene, creature, { name = creature.name, shadows = false } = {}) {
    this.T = T;
    this.scene = scene;
    this.creature = creature;
    this.name = name;
    this.capacity = 0;
    this.count = 0;
    this.mesh = null;
    this.vat = createVat(T, creature);
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
  ensure(needed) {
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
  begin(expected) {
    this.ensure(expected);
    this.count = 0;
  }
  add(matrix, phase) {
    this.ensure(this.count + 1);
    this.mesh.setMatrixAt(this.count, matrix);
    this.phases.array[this.count] = phase;
    this.count++;
  }
  end(time = 0) {
    if (!this.mesh) return;
    this.mesh.count = this.count;
    this.uniforms.vatTime.value = ((time % 1) + 1) % 1;
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.phases.needsUpdate = true;
    }
  }
  dispose() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.capacity = 0;
    this.count = 0;
    this.material.dispose();
    this.depthMaterial?.dispose();
    this.vat.texture.dispose();
  }
}
