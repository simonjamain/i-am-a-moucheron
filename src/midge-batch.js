// Midges are drawn in batches, with cheap Object3D proxies for gameplay; proxies
// stay outside the render scene so thousands of midges share a few draw calls.
// Near midges use the rigged Meshy model through a vertex animation texture
// (src/creature-batch.js, cycle in src/midge-model.js). Distant midges (a few
// pixels) keep three cheap ellipsoid batches.
import { MIDGE_SPHERE_RADIUS } from './scale.js';
import { MIDGE, MIDGE_FLIGHT } from './midge-model.js';
import { CreatureBatch } from './creature-batch.js';

// Detailed model while the midge's apparent radius (world radius / distance)
// exceeds this ratio (about 7 px at 1 000 px height with a 70 degree lens),
// at most `limit` at once (nearest are not sorted: first come).
export const MIDGE_LOD = Object.freeze({ ratio: 0.01, limit: 1000 });

export class MidgeBatch {
  constructor(T, scene, { enabled = true, capacity = 128, detailed = true } = {}) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.capacity = 0;
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
    if (detailed) this.detail = new CreatureBatch(T, scene, MIDGE, { name: 'moucherons' });
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
    if (camera) camera.getWorldPosition(this.cameraPosition);
    let near = 0,
      far = 0;
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      let detail = !!this.detail && near < MIDGE_LOD.limit;
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
    this.detail?.begin(near);
    let i = 0;
    const [body, head, wings] = this.meshes;
    const beat = (now / 1000 / MIDGE_FLIGHT.loop) * MIDGE_FLIGHT.beats * Math.PI * 2;
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      this.root.compose(model.position, model.quaternion, model.scale);
      if (model.userData.midgeDetail) {
        this.detail.add(this.root, model.userData.loopPhase ?? 0);
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
    this.detail?.end(now / 1000 / MIDGE_FLIGHT.loop);
  }
  dispose() {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes.length = 0;
    this.detail?.dispose();
    this.detail = null;
    this.geometry?.dispose();
    for (const material of this.materials || []) material.dispose();
    this.capacity = 0;
  }
}
