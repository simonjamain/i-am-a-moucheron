import { MAP } from './scale.js';

// Purely client-side exhaust: no physics, hitboxes or network messages.
// Issue #108: per-projectile look. Trails are darker and thicker than before,
// the flame brighter, and an additive halo of constant screen size keeps the
// engine visible from afar (stronger and pulsing for the guided missile).
export const EXHAUST_PROFILES = Object.freeze({
  rocket: Object.freeze({
    puff: [0x5d605c, 0x8a897e],
    puffScale: 1.3,
    opacity: 0.5,
    spacing: 0.65,
    life: 3.2,
    flame: 1.2,
    halo: 0.024,
    haloColor: 0xffb04a,
    pulse: 0,
  }),
  missile: Object.freeze({
    puff: [0x4a4d4a, 0x7b7a70],
    puffScale: 1.6,
    opacity: 0.6,
    spacing: 0.8,
    life: 5,
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

// Soft, billowy smoke sprite: a round cloud made of a few overlapping lobes
// with a deterministic ragged edge, so trails read as smoke, not as spheres.
function smokeTexture(T) {
  const size = 64,
    pixels = new Uint8Array(size * size * 4);
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const lobes = Array.from({ length: 7 }, (_, i) => ({
    x: (hash(i + 1) - 0.5) * 0.5,
    y: (hash(i + 11) - 0.5) * 0.5,
    r: 0.3 + hash(i + 21) * 0.2,
  }));
  for (let i = 0; i < size * size; i++) {
    const x = ((i % size) + 0.5) / size - 0.5,
      y = (Math.floor(i / size) + 0.5) / size - 0.5;
    let a = 0;
    for (const l of lobes) a = Math.max(a, 1 - Math.hypot(x - l.x, y - l.y) / l.r);
    a = Math.max(0, Math.min(1, a * 1.2));
    a = a * a * (3 - 2 * a) * Math.max(0, 1 - Math.hypot(x, y) * 1.9);
    pixels.set([255, 255, 255, Math.round(255 * a)], i * 4);
  }
  const texture = new T.DataTexture(pixels, size, size);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class MissileExhaust {
  constructor(T, scene, maxPuffs = 900) {
    this.T = T;
    this.scene = scene;
    this.maxPuffs = maxPuffs;
    this.puffs = [];
    this.emitters = new Map();
    this.smokeMap = smokeTexture(T);
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
    const rand = (k) => {
      const v = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const material = new T.SpriteMaterial({
      map: this.smokeMap,
      color: profile.puff[seed % 4 === 0 ? 1 : 0],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      rotation: rand(1) * Math.PI * 2,
    });
    const mesh = new T.Sprite(material);
    mesh.position.copy(position);
    const spread = MAP.metres(0.07);
    mesh.position.x += (rand(2) - 0.5) * spread;
    mesh.position.z += (rand(3) - 0.5) * spread;
    mesh.userData.projectileSolid = false;
    this.scene.add(mesh);
    this.puffs.push({
      mesh,
      material,
      age: 0,
      life: profile.life * (0.9 + (seed % 5) * 0.05),
      opacity: profile.opacity,
      scale: profile.puffScale,
      spin: (rand(4) - 0.5) * 0.9,
      drift: [
        (rand(5) - 0.5) * MAP.metres(0.5),
        MAP.metres(0.1 + rand(6) * 0.2),
        (rand(7) - 0.5) * MAP.metres(0.5),
      ],
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
        // Quick fade-in (no popping), slow fade-out; fast swell that settles.
        p.material.opacity = p.opacity * Math.min(1, t / 0.06) * (1 - t * t);
        p.material.rotation += p.spin * step;
        p.mesh.scale.setScalar(MAP.metres(0.42) * p.scale * (0.8 + 4 * (1 - (1 - t) ** 2)));
        p.mesh.position.x += p.drift[0] * step;
        p.mesh.position.y += p.drift[1] * step;
        p.mesh.position.z += p.drift[2] * step;
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
