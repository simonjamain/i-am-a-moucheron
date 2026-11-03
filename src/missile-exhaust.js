import { MAP } from './scale.js';

// Purely client-side exhaust: no physics, hitboxes or network messages.
export class MissileExhaust {
  constructor(T, scene, maxPuffs = 320) {
    this.T = T;
    this.scene = scene;
    this.maxPuffs = maxPuffs;
    this.puffs = [];
    this.emitters = new Map();
    this.geometry = new T.IcosahedronGeometry(MAP.metres(0.17), 1);
    this.flameGeometry = new T.ConeGeometry(MAP.metres(0.13), MAP.metres(0.65), 7);
    this.flameMaterial = new T.MeshBasicMaterial({
      color: 0xffa333, transparent: true, opacity: 0.94,
      blending: T.AdditiveBlending, depthWrite: false,
    });
    this.coreGeometry = new T.ConeGeometry(MAP.metres(0.07), MAP.metres(0.38), 7);
    this.coreMaterial = new T.MeshBasicMaterial({
      color: 0xfff1ac, blending: T.AdditiveBlending, depthWrite: false,
    });
  }
  attach(id, model) {
    const T = this.T;
    const flame = new T.Mesh(this.flameGeometry, this.flameMaterial);
    const core = new T.Mesh(this.coreGeometry, this.coreMaterial);
    for (const mesh of [flame, core]) {
      mesh.rotation.z = Math.PI;
      mesh.userData.projectileSolid = false;
      model.add(mesh);
    }
    flame.position.y = -MAP.metres(0.56);
    core.position.y = -MAP.metres(0.53);
    this.emitters.set(id, { flame, core, previous: null, carry: 0 });
  }
  detach(id) {
    this.emitters.delete(id);
  }
  puff(position, seed) {
    if (this.puffs.length >= this.maxPuffs) this.remove(this.puffs.shift());
    const T = this.T;
    const material = new T.MeshBasicMaterial({
      color: seed % 4 === 0 ? 0xb6b5a7 : 0x777b77,
      transparent: true, opacity: 0.35, depthWrite: false,
    });
    const mesh = new T.Mesh(this.geometry, material);
    mesh.position.copy(position);
    mesh.userData.projectileSolid = false;
    this.scene.add(mesh);
    this.puffs.push({ mesh, material, age: 0, life: 0.7 + (seed % 5) * 0.11 });
  }
  remove(puff) {
    this.scene.remove(puff.mesh);
    puff.material.dispose();
  }
  update(dt, active) {
    const step = Math.min(0.1, Math.max(0, dt));
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += step;
      const t = p.age / p.life;
      if (t >= 1) {
        this.remove(p);
        this.puffs.splice(i, 1);
      } else {
        p.material.opacity = 0.35 * (1 - t) ** 1.5;
        p.mesh.scale.setScalar(0.65 + 2.7 * t);
        p.mesh.position.y += MAP.metres(0.12) * step;
      }
    }
    for (const [id, emitter] of this.emitters) {
      const position = active.get(id);
      if (!position) continue;
      const { flame, core } = emitter;
      const flicker = 0.88 + 0.12 * Math.sin(performance.now() * 0.045 + id.length);
      flame.scale.set(1, flicker, 1);
      core.scale.set(0.9, flicker, 0.9);
      if (!emitter.previous) {
        emitter.previous = position.clone();
        this.puff(position, this.puffs.length);
        continue;
      }
      const distance = emitter.previous.distanceTo(position);
      // Prevent a network correction from painting a giant smoke line.
      if (distance > MAP.metres(40)) {
        emitter.previous.copy(position);
        emitter.carry = 0;
        continue;
      }
      const spacing = MAP.metres(0.55);
      const count = Math.min(8, Math.floor((distance + emitter.carry) / spacing));
      for (let i = 1; i <= count; i++) {
        const t = Math.min(1, (i * spacing - emitter.carry) / Math.max(distance, 1e-9));
        this.puff(emitter.previous.clone().lerp(position, t), this.puffs.length + i);
      }
      emitter.carry = (distance + emitter.carry) % spacing;
      emitter.previous.copy(position);
    }
  }
}
