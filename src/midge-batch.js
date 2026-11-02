// One graphics batch per component, with cheap Object3D proxies for gameplay.
// Proxies remain outside the render scene so thousands of midges share three draw calls.
import { MIDGE_SPHERE_RADIUS } from './scale.js';
export class MidgeBatch {
  constructor(T, scene, { enabled = true, capacity = 128 } = {}) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.capacity = 0;
    this.meshes = [];
    if (!enabled) return;
    this.geometry = new T.SphereGeometry(1, 8, 6);
    this.materials = [
      new T.MeshStandardMaterial({ color: '#393e2b', roughness: 0.75 }),
      new T.MeshStandardMaterial({ color: '#c6b96e', roughness: 0.75 }),
      new T.MeshStandardMaterial({
        color: '#edf2d5',
        transparent: true,
        opacity: 0.55,
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
      phase,
      hitTolerance: 1.2,
      wings: [],
      legs: [],
      disposables: [],
    };
    // This object is only an inexpensive logical transform; it never enters the scene.
    return model;
  }
  flush(insects, now = 0) {
    if (!this.enabled) return;
    let count = 0;
    for (const model of insects.values())
      if (model.userData.instancedMidge && model.visible) count++;
    this.ensure(count);
    let i = 0;
    const [body, head, wings] = this.meshes;
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      this.root.compose(model.position, model.quaternion, model.scale);
      body.setMatrixAt(i, this.result.multiplyMatrices(this.root, this.localParts[0]));
      head.setMatrixAt(i, this.result.multiplyMatrices(this.root, this.localParts[1]));
      const flap = Math.sin(now * 0.065 + model.userData.phase) * 0.65;
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
      mesh.count = count * (part === 2 ? 2 : 1);
      if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes.length = 0;
    this.geometry?.dispose();
    for (const material of this.materials || []) material.dispose();
    this.capacity = 0;
  }
}
