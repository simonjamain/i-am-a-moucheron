// Shared meshes for hundreds of spiderlings; gameplay keeps per-child proxies.
import { SPIDERLING_SPHERE_RADIUS } from './scale.js';

export class SpiderlingBatch {
  constructor(T, scene, { enabled = true } = {}) {
    Object.assign(this, { T, scene, enabled, capacity: 0, meshes: [] });
    if (!enabled) return;
    this.sphere = new T.SphereGeometry(1, 8, 6);
    this.leg = new T.BoxGeometry(1, 1, 1);
    this.materials = [
      new T.MeshStandardMaterial({ color: '#66544c', roughness: 0.8 }),
      new T.MeshStandardMaterial({ color: '#342e2b', roughness: 0.8 }),
      new T.MeshStandardMaterial({ color: '#382d28', roughness: 0.8 }),
    ];
    this.world = new T.Matrix4();
    this.local = new T.Matrix4();
    this.result = new T.Matrix4();
    this.rotation = new T.Quaternion();
    this.position = new T.Vector3();
    this.scale = new T.Vector3();
    this.ensure(128);
  }
  ensure(needed) {
    if (!this.enabled || needed <= this.capacity) return;
    let capacity = Math.max(128, this.capacity);
    while (capacity < needed) capacity *= 2;
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.meshes = this.materials.map((material, i) => {
      const mesh = new this.T.InstancedMesh(
        i === 2 ? this.leg : this.sphere,
        material,
        capacity * (i === 2 ? 8 : 1),
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
  create() {
    const model = new this.T.Object3D();
    model.userData = {
      instancedSpiderling: true,
      sphereRadius: SPIDERLING_SPHERE_RADIUS,
      hitTolerance: 1,
      wings: [],
      legs: [],
      disposables: [],
    };
    return model;
  }
  flush(insects) {
    if (!this.enabled) return;
    const alive = [...insects.values()].filter((g) => g.userData.instancedSpiderling && g.visible);
    this.ensure(alive.length);
    const [bodies, heads, legs] = this.meshes;
    for (const [i, model] of alive.entries()) {
      this.world.compose(model.position, model.quaternion, model.scale);
      this.position.set(0, 0.06, 0.38);
      this.scale.set(0.5, 0.4, 0.63);
      this.local.compose(this.position, this.rotation, this.scale);
      bodies.setMatrixAt(i, this.result.multiplyMatrices(this.world, this.local));
      this.position.set(0, 0.02, -0.48);
      this.scale.set(0.34, 0.34, 0.34);
      this.local.compose(this.position, this.rotation, this.scale);
      heads.setMatrixAt(i, this.result.multiplyMatrices(this.world, this.local));
      for (const side of [-1, 1])
        for (let j = 0; j < 4; j++) {
          this.position.set(side * 0.64, -0.14, (j - 1.5) * 0.3);
          this.rotation.setFromAxisAngle(new this.T.Vector3(0, 0, 1), side * 0.38);
          this.scale.set(0.82, 0.055, 0.055);
          this.local.compose(this.position, this.rotation, this.scale);
          legs.setMatrixAt(
            i * 8 + (side === -1 ? 0 : 4) + j,
            this.result.multiplyMatrices(this.world, this.local),
          );
        }
      this.rotation.identity();
    }
    for (const [i, mesh] of this.meshes.entries()) {
      mesh.count = alive.length * (i === 2 ? 8 : 1);
      if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    for (const material of this.materials || []) material.dispose();
    this.sphere?.dispose();
    this.leg?.dispose();
    this.meshes.length = 0;
    this.capacity = 0;
  }
}
