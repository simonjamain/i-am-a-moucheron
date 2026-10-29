import { MAP, ACTOR_UNIT, INSECT_SCALE, REFERENCE, FLAK } from './scale.js';
import { OFFICE_LAYOUT, RAID_DURATION, RAID_LENGTH, raidPosition } from './layout.js';
export function spreadDirection(T, direction, random = Math.random, angle = 0.003) {
  const n = direction.clone().normalize(),
    right = new T.Vector3(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = n.clone().cross(right),
    r = Math.sqrt(random()) * Math.tan(angle),
    a = random() * Math.PI * 2;
  return n
    .addScaledVector(right, r * Math.cos(a))
    .addScaledVector(up, r * Math.sin(a))
    .normalize();
}
export function fuseRange(value) {
  return Math.max(
    FLAK.minRange,
    Math.min(FLAK.maxRange, Math.round(value / FLAK.step) * FLAK.step),
  );
}
export function blastDamage(distance, radius = MAP.metres(FLAK.radius)) {
  return distance > radius ? 0 : Math.round(80 - (60 * Math.max(0, distance)) / radius);
}
// Direct contact consumes a shell; only a solid obstacle beyond the safety
// distance can turn contact into an explosion. The timed fuse is handled once
// by the caller when there was no earlier contact.
export function shellImpact(hit, distance, minimum) {
  if (!hit.wall) return { kind: 'direct', damage: 200 };
  return { kind: distance >= minimum ? 'blast' : 'inert', damage: 0 };
}
export function diveIntensity(speed, forwardY, maxSpeed) {
  return (
    Math.max(0, Math.min(1, (speed / maxSpeed - 0.68) / 0.28)) *
    Math.max(0, Math.min(1, (-forwardY - 0.25) / 0.45))
  );
}
export function createRaid(T) {
  return {
    length: RAID_LENGTH,
    duration: RAID_DURATION,
    position(index, t) {
      const age = t - index * 1.5;
      if (age < 0 || age >= RAID_DURATION) return null;
      const p = new T.Vector3().fromArray(raidPosition(age / RAID_DURATION));
      p.y += Math.sin(age * 1.7 + index) * MAP.metres(0.1);
      return p;
    },
  };
}
export class CombatEffects {
  constructor(T, scene) {
    this.T = T;
    this.scene = scene;
    this.items = [];
  }
  muzzle(position, direction) {
    const T = this.T,
      g = new T.Group(),
      m = new T.MeshBasicMaterial({
        color: '#fff1a5',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
    g.add(new T.Mesh(new T.OctahedronGeometry(MAP.metres(0.3), 0), m));
    const flame = new T.Mesh(new T.ConeGeometry(MAP.metres(0.12), MAP.metres(0.8), 6), m);
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -MAP.metres(0.3);
    g.add(flame);
    g.position.copy(position);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), direction);
    this.scene.add(g);
    this.items.push({ g, m, age: 0, life: 0.07, kind: 'muzzle' });
    this.trim();
  }
  blast(position, radius = MAP.metres(FLAK.radius)) {
    const T = this.T,
      g = new T.Group(),
      flash = new T.MeshBasicMaterial({
        color: '#ffd497',
        transparent: true,
        opacity: 1,
        depthWrite: false,
      }),
      m = new T.MeshStandardMaterial({
        color: '#20251f',
        roughness: 1,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
    const core = new T.Mesh(new T.IcosahedronGeometry(radius * 0.3, 1), flash);
    g.add(core);
    const smoke = [];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39996,
        v = new T.Vector3(Math.cos(a), Math.sin(i * 1.71) * 0.6, Math.sin(a)).normalize();
      const puff = new T.Mesh(new T.IcosahedronGeometry(radius * (0.24 + (i % 3) * 0.06), 1), m);
      puff.position.copy(v).multiplyScalar(radius * 0.15);
      g.add(puff);
      smoke.push({ p: puff, v: v.multiplyScalar(radius * 0.28) });
    }
    const shards = [],
      metal = new T.MeshBasicMaterial({
        color: '#414437',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
    for (let i = 0; i < 20; i++) {
      const a = i * 2.39996,
        v = new T.Vector3(Math.cos(a), Math.sin(i * 1.37), Math.sin(a))
          .normalize()
          .multiplyScalar(radius * (1.5 + (i % 4) * 0.3)),
        p = new T.Mesh(new T.OctahedronGeometry(radius * 0.025, 0), metal);
      g.add(p);
      shards.push({ p, v });
    }
    g.position.copy(position);
    this.scene.add(g);
    this.items.push({
      g,
      m,
      core,
      flash,
      metal,
      smoke,
      shards,
      age: 0,
      life: 4.8,
      kind: 'blast',
      radius,
    });
    this.trim();
  }
  trim() {
    while (this.items.length > 40) this.remove(this.items[0]);
  }
  remove(e) {
    this.scene.remove(e.g);
    e.g.traverse((o) => o.geometry?.dispose());
    e.m.dispose();
    e.flash?.dispose();
    e.metal?.dispose();
    this.items.splice(this.items.indexOf(e), 1);
  }
  update(dt, camera) {
    for (const e of [...this.items]) {
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        this.remove(e);
        continue;
      }
      e.m.opacity =
        e.kind === 'muzzle' ? (1 - t) * 0.95 : Math.min(1, e.age * 8) * 0.8 * Math.pow(1 - t, 0.7);
      if (e.kind === 'blast') {
        e.flash.opacity = Math.max(0, 1 - e.age / 0.13);
        e.core.visible = e.age < 0.16;
        e.core.scale.setScalar(1 + e.age * 8);
        e.metal.opacity = Math.max(0, 1 - e.age / 3.5);
        for (const c of e.smoke) {
          c.p.position.addScaledVector(c.v, dt);
          c.p.position.y += MAP.metres(0.4) * dt;
          c.p.scale.setScalar(0.7 + Math.min(2.2, e.age * 0.7));
        }
        for (const c of e.shards) {
          c.v.y -= MAP.metres(9.81) * dt;
          c.v.multiplyScalar(Math.exp(-0.8 * dt));
          c.p.position.addScaledVector(c.v, dt);
          c.p.rotation.x += dt * 5;
        }
      }
    }
  }
}
