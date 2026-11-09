// Midges are drawn in batches, with cheap Object3D proxies for gameplay; proxies
// stay outside the render scene so thousands of midges share a few draw calls.
// Near midges use the rigged Meshy model: its flight cycle is baked into a
// vertex animation texture sampled per instance phase (src/midge-model.js).
// Distant midges (a few pixels) keep three cheap ellipsoid batches.
import { MIDGE_SPHERE_RADIUS } from './scale.js';
import { MIDGE_FLIGHT, bakeFlight, midgeGeometry, midgeTexture } from './midge-model.js';

// Detailed model while the midge's apparent radius (world radius / distance)
// exceeds this ratio (about 7 px at 1 000 px height with a 70 degree lens),
// at most `limit` at once (nearest are not sorted: first come).
export const MIDGE_LOD = Object.freeze({ ratio: 0.01, limit: 1000 });
const TEXTURE_WIDTH = 1024;

function createVat(T) {
  const bake = bakeFlight(T);
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

function vatMaterial(T, vat) {
  const material = new T.MeshStandardMaterial({
    map: midgeTexture(T),
    roughness: 0.75,
    side: T.DoubleSide,
  });
  const uniforms = {
    midgeVat: { value: vat.texture },
    midgeLoop: { value: 0 },
    midgeFrames: { value: vat.frames },
    midgeCount: { value: vat.count },
  };
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => 'midge-vat';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2D midgeVat;
uniform float midgeLoop;
uniform float midgeFrames;
uniform float midgeCount;
attribute float midgeVertex;
attribute float midgePhase;
vec3 midgeFetch(float frame, float row) {
  int i = int(row * midgeFrames * midgeCount + frame * midgeCount + midgeVertex);
  return texelFetch(midgeVat, ivec2(i % ${TEXTURE_WIDTH}, i / ${TEXTURE_WIDTH}), 0).xyz;
}
vec3 midgeSample(float row) {
  float f = fract(midgeLoop + midgePhase) * midgeFrames;
  float a = floor(f);
  float b = mod(a + 1.0, midgeFrames);
  return mix(midgeFetch(a, row), midgeFetch(b, row), f - a);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = normalize(midgeSample(1.0));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif',
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = midgeSample(0.0);');
  };
  return material;
}

export class MidgeBatch {
  constructor(T, scene, { enabled = true, capacity = 128, detailed = true } = {}) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.capacity = 0;
    this.detailCapacity = 0;
    this.meshes = [];
    this.detail = null;
    if (!enabled) return;
    this.geometry = new T.SphereGeometry(1, 8, 6);
    // Far impostor colours follow the Meshy texture (brown body, cream eyes and wings).
    this.materials = [
      new T.MeshStandardMaterial({ color: '#6b4446', roughness: 0.75 }),
      new T.MeshStandardMaterial({ color: '#7d5052', roughness: 0.75 }),
      new T.MeshStandardMaterial({
        color: '#efe3c6',
        transparent: true,
        opacity: 0.7,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    ];
    this.root = new T.Matrix4();
    this.local = new T.Matrix4();
    this.result = new T.Matrix4();
    this.partPosition = new T.Vector3();
    this.partRotation = new T.Quaternion();
    this.partScale = new T.Vector3();
    this.partEuler = new T.Euler();
    this.cameraPosition = new T.Vector3();
    this.localParts = [
      new T.Matrix4().compose(
        new T.Vector3(0, 0, 0),
        new T.Quaternion(),
        new T.Vector3(0.35, 0.35, 0.7),
      ),
      new T.Matrix4().compose(
        new T.Vector3(0, 0.18, -0.55),
        new T.Quaternion(),
        new T.Vector3(0.3, 0.3, 0.3),
      ),
    ];
    if (detailed) {
      this.vat = createVat(T);
      const source = midgeGeometry(T);
      this.detailGeometry = new T.InstancedBufferGeometry();
      this.detailGeometry.setIndex(source.index);
      // Position is only read for bounds; the vertex shader fetches the VAT.
      this.detailGeometry.setAttribute('position', source.attributes.position);
      this.detailGeometry.setAttribute('normal', source.attributes.normal);
      this.detailGeometry.setAttribute('uv', source.attributes.uv);
      this.detailGeometry.setAttribute(
        'midgeVertex',
        new T.BufferAttribute(
          Float32Array.from({ length: this.vat.count }, (_, i) => i),
          1,
        ),
      );
      this.detailMaterial = vatMaterial(T, this.vat);
    }
    this.ensure(capacity);
  }
  ensure(needed) {
    if (!this.enabled || this.capacity >= needed) return;
    let capacity = Math.max(128, this.capacity);
    while (capacity < needed) capacity *= 2;
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes = this.materials.map((material, part) => {
      const mesh = new this.T.InstancedMesh(
        this.geometry,
        material,
        capacity * (part === 2 ? 2 : 1),
      );
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.projectileSolid = false;
      this.scene.add(mesh);
      return mesh;
    });
    this.capacity = capacity;
  }
  ensureDetail(needed) {
    if (!this.detailGeometry || this.detailCapacity >= needed) return;
    let capacity = Math.max(64, this.detailCapacity);
    while (capacity < needed) capacity *= 2;
    if (this.detail) this.scene.remove(this.detail);
    this.phases = new this.T.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.phases.setUsage(this.T.DynamicDrawUsage);
    this.detailGeometry.setAttribute('midgePhase', this.phases);
    this.detail = new this.T.InstancedMesh(this.detailGeometry, this.detailMaterial, capacity);
    this.detail.name = 'moucherons-meshy';
    this.detail.count = 0;
    this.detail.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    this.detail.frustumCulled = false;
    this.detail.userData.projectileSolid = false;
    this.scene.add(this.detail);
    this.detailCapacity = capacity;
  }
  create(phase = 0) {
    const model = new this.T.Object3D();
    model.userData = {
      enemyType: 'midge',
      instancedMidge: true,
      sphereRadius: MIDGE_SPHERE_RADIUS,
      // Loop offset in [0, 1): each midge beats out of step with its neighbours.
      phase,
      loopPhase: (((phase * 0.6180339887) % 1) + 1) % 1,
      hitTolerance: 1.2,
      wings: [],
      legs: [],
      disposables: [],
    };
    // This object is only an inexpensive logical transform; it never enters the scene.
    return model;
  }
  // `now` in ms; `camera` selects the detailed model for near midges (all of
  // them, up to the limit, without a camera).
  flush(insects, now = 0, camera = null) {
    if (!this.enabled) return;
    const detailed = !!this.detailGeometry;
    if (camera) camera.getWorldPosition(this.cameraPosition);
    let near = 0,
      far = 0;
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      let detail = detailed && near < MIDGE_LOD.limit;
      if (detail && camera) {
        const radius = MIDGE_SPHERE_RADIUS * Math.abs(model.scale.x);
        const distance = model.position.distanceTo(this.cameraPosition);
        detail = radius > distance * MIDGE_LOD.ratio;
      }
      model.userData.midgeDetail = detail;
      if (detail) near++;
      else far++;
    }
    this.ensure(far);
    this.ensureDetail(near);
    let i = 0,
      n = 0;
    const [body, head, wings] = this.meshes;
    const beat = (now / 1000 / MIDGE_FLIGHT.loop) * MIDGE_FLIGHT.beats * Math.PI * 2;
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      this.root.compose(model.position, model.quaternion, model.scale);
      if (model.userData.midgeDetail) {
        this.detail.setMatrixAt(n, this.root);
        this.phases.array[n] = model.userData.loopPhase ?? 0;
        n++;
        continue;
      }
      body.setMatrixAt(i, this.result.multiplyMatrices(this.root, this.localParts[0]));
      head.setMatrixAt(i, this.result.multiplyMatrices(this.root, this.localParts[1]));
      const flap = Math.sin(beat + model.userData.phase) * 0.65;
      for (let side = 0; side < 2; side++) {
        const direction = side ? 1 : -1;
        this.partPosition.set(direction * 0.8, 0.15, 0);
        this.partEuler.set(0, 0, flap * direction);
        this.partRotation.setFromEuler(this.partEuler);
        this.partScale.set(1, 0.025, 0.45);
        this.local.compose(this.partPosition, this.partRotation, this.partScale);
        wings.setMatrixAt(i * 2 + side, this.result.multiplyMatrices(this.root, this.local));
      }
      i++;
    }
    for (const [part, mesh] of this.meshes.entries()) {
      mesh.count = far * (part === 2 ? 2 : 1);
      if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.detail) {
      this.detail.count = near;
      this.detailMaterial.userData.uniforms.midgeLoop.value = (now / 1000 / MIDGE_FLIGHT.loop) % 1;
      if (near) {
        this.detail.instanceMatrix.needsUpdate = true;
        this.phases.needsUpdate = true;
      }
    }
  }
  dispose() {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes.length = 0;
    if (this.detail) this.scene.remove(this.detail);
    this.detail = null;
    this.detailCapacity = 0;
    this.geometry?.dispose();
    for (const material of this.materials || []) material.dispose();
    this.detailMaterial?.dispose();
    this.vat?.texture.dispose();
    this.detailGeometry = null;
    this.capacity = 0;
  }
}
