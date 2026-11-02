import { MAP } from './scale.js';

// Purely cosmetic insect impacts: one instanced draw call for all the droplets.
// Nothing here participates in projectile collisions or shared game physics.
export class BloodEffects {
  constructor(T, scene, { capacity = 240, particlesPerHit = 18, scale = MAP.ratio } = {}) {
    this.T = T;
    this.scene = scene;
    this.capacity = capacity;
    this.particlesPerHit = Math.min(particlesPerHit, capacity);
    this.scale = scale;
    this.drops = [];
    this.bursts = 0;
    this.geometry = new T.IcosahedronGeometry(1, 0);
    this.material = new T.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    this.mesh = new T.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.projectileSolid = false;
    scene.add(this.mesh);
    this.colors = ['#a60819', '#da1c2b', '#7c0613', '#e34237'].map((c) => new T.Color(c));
    this.dummy = new T.Object3D();
    this.heading = new T.Vector3();
    this.up = new T.Vector3(0, 1, 0);
  }

  burst(point, { size = this.scale } = {}) {
    if (!point || ![point.x, point.y, point.z, size].every(Number.isFinite)) return false;
    const radius = Math.max(this.scale * 0.55, Math.min(this.scale * 1.7, size * 0.22));
    const burst = this.bursts++;
    for (let i = 0; i < this.particlesPerHit; i++) {
      const angle = (i + burst * 0.73) * 2.399963229728653;
      const rise = 0.15 + ((i * 7 + burst) % 9) * 0.11;
      const spread = Math.sqrt(Math.max(0, 1 - rise * rise));
      const velocity = new this.T.Vector3(
        Math.cos(angle) * spread,
        rise,
        Math.sin(angle) * spread,
      ).multiplyScalar(this.scale * (5.5 + (i % 5) * 2.2));
      this.drops.push({
        position: point.clone(),
        velocity,
        radius: radius * (i % 6 === 0 ? 1.65 : i % 3 === 0 ? 1.2 : 0.8),
        age: 0,
        lifetime: 0.65 + (i % 5) * 0.08,
        color: (i + burst) % this.colors.length,
      });
    }
    if (this.drops.length > this.capacity) this.drops.splice(0, this.drops.length - this.capacity);
    this.flush();
    return true;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.age += dt;
      if (drop.age >= drop.lifetime) {
        this.drops.splice(i, 1);
        continue;
      }
      drop.velocity.y -= this.scale * 14 * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      const floor = drop.radius * 0.65;
      if (drop.position.y < floor) {
        drop.position.y = floor;
        drop.velocity.y = Math.abs(drop.velocity.y) * 0.16;
        drop.velocity.x *= 0.82;
        drop.velocity.z *= 0.82;
      }
    }
    this.flush();
  }

  flush() {
    for (const [i, drop] of this.drops.entries()) {
      const fade = Math.min(1, Math.max(0, (drop.lifetime - drop.age) / 0.25));
      const radius = drop.radius * fade;
      this.dummy.position.copy(drop.position);
      this.heading.copy(drop.velocity);
      if (this.heading.lengthSq() < 1e-12) this.heading.copy(this.up);
      this.heading.normalize();
      this.dummy.quaternion.setFromUnitVectors(this.up, this.heading);
      this.dummy.scale.set(radius * 0.85, radius * 1.6, radius * 0.85);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.colors[drop.color]);
    }
    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.drops.length = 0;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
