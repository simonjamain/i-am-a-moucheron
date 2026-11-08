import { MAP } from './scale.js';

// Purely client-side exhaust: no physics, hitboxes or network messages.
// Issue #108: per-projectile look. Trails are darker and thicker than before,
// the flame brighter, and an additive halo of constant screen size keeps the
// engine visible from afar (stronger and pulsing for the guided missile).
export const EXHAUST_PROFILES = Object.freeze({
  rocket: Object.freeze({
    puff: [0x5d605c, 0x8a897e],
    puffScale: 1.3,
    opacity: 0.48,
    spacing: 0.45,
    life: 0.8,
    flame: 1.2,
    halo: 0.024,
    haloColor: 0xffb04a,
    pulse: 0,
  }),
  missile: Object.freeze({
    puff: [0x4a4d4a, 0x7b7a70],
    puffScale: 1.6,
    opacity: 0.55,
    spacing: 0.4,
    life: 1.05,
    flame: 1.45,
    halo: 0.036,
    haloColor: 0xffd27a,
    pulse: 0.25,
  }),
});

function haloTexture(T) {
  const size = 32,
    pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const d =
      Math.hypot(((i % size) + 0.5) / size - 0.5, (Math.floor(i / size) + 0.5) / size - 0.5) * 2;
    const a = Math.max(0, 1 - d) ** 2;
    pixels.set([255, 255, 255, Math.round(255 * a)], i * 4);
  }
  const texture = new T.DataTexture(pixels, size, size);
  texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

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
      color: 0xffa333,
      transparent: true,
      opacity: 0.94,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.coreGeometry = new T.ConeGeometry(MAP.metres(0.07), MAP.metres(0.38), 7);
    this.coreMaterial = new T.MeshBasicMaterial({
      color: 0xffffff,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.haloMap = haloTexture(T);
    this.haloMaterials = new Map();
  }
  haloMaterial(profile) {
    let material = this.haloMaterials.get(profile);
    if (!material) {
      material = new this.T.SpriteMaterial({
        map: this.haloMap,
        color: profile.haloColor,
        transparent: true,
        opacity: 0.9,
        blending: this.T.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false,
      });
      this.haloMaterials.set(profile, material);
    }
    return material;
  }
  attach(id, model, weapon = 'rocket') {
    const T = this.T,
      profile = EXHAUST_PROFILES[weapon] || EXHAUST_PROFILES.rocket;
    const flame = new T.Mesh(this.flameGeometry, this.flameMaterial);
    const core = new T.Mesh(this.coreGeometry, this.coreMaterial);
    for (const mesh of [flame, core]) {
      mesh.rotation.z = Math.PI;
      mesh.userData.projectileSolid = false;
      model.add(mesh);
    }
    flame.position.y = -MAP.metres(0.56) * profile.flame;
    core.position.y = -MAP.metres(0.53) * profile.flame;
    const halo = new T.Sprite(this.haloMaterial(profile));
    halo.scale.setScalar(profile.halo);
    halo.position.y = -MAP.metres(0.6) * profile.flame;
    halo.userData.projectileSolid = false;
    halo.renderOrder = 6;
    model.add(halo);
    this.emitters.set(id, { flame, core, halo, profile, previous: null, carry: 0 });
  }
  detach(id) {
    this.emitters.delete(id);
  }
  puff(position, seed, profile = EXHAUST_PROFILES.rocket) {
    if (this.puffs.length >= this.maxPuffs) this.remove(this.puffs.shift());
    const T = this.T;
    const material = new T.MeshBasicMaterial({
      color: profile.puff[seed % 4 === 0 ? 1 : 0],
      transparent: true,
      opacity: profile.opacity,
      depthWrite: false,
    });
    const mesh = new T.Mesh(this.geometry, material);
    mesh.position.copy(position);
    mesh.userData.projectileSolid = false;
    this.scene.add(mesh);
    this.puffs.push({
      mesh,
      material,
      age: 0,
      life: profile.life + (seed % 5) * 0.11,
      opacity: profile.opacity,
      scale: profile.puffScale,
    });
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
        p.material.opacity = p.opacity * (1 - t) ** 1.5;
        p.mesh.scale.setScalar(p.scale * (0.65 + 2.7 * t));
        p.mesh.position.y += MAP.metres(0.12) * step;
      }
    }
    for (const [id, emitter] of this.emitters) {
      const position = active.get(id);
      if (!position) continue;
      const { flame, core, halo, profile } = emitter;
      const now = performance.now();
      const flicker = 0.88 + 0.12 * Math.sin(now * 0.045 + id.length);
      flame.scale.set(profile.flame, flicker * profile.flame, profile.flame);
      core.scale.set(0.9 * profile.flame, flicker * profile.flame, 0.9 * profile.flame);
      halo.scale.setScalar(profile.halo * (1 + profile.pulse * Math.sin(now * 0.012)) * flicker);
      if (!emitter.previous) {
        emitter.previous = position.clone();
        this.puff(position, this.puffs.length, profile);
        continue;
      }
      const distance = emitter.previous.distanceTo(position);
      // Prevent a network correction from painting a giant smoke line.
      if (distance > MAP.metres(40)) {
        emitter.previous.copy(position);
        emitter.carry = 0;
        continue;
      }
      const spacing = MAP.metres(profile.spacing);
      const count = Math.min(8, Math.floor((distance + emitter.carry) / spacing));
      for (let i = 1; i <= count; i++) {
        const t = Math.min(1, (i * spacing - emitter.carry) / Math.max(distance, 1e-9));
        this.puff(emitter.previous.clone().lerp(position, t), this.puffs.length + i, profile);
      }
      emitter.carry = (distance + emitter.carry) % spacing;
      emitter.previous.copy(position);
    }
  }
}
