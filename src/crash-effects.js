import { MAP } from './scale.js';
export class CrashEffects {
  constructor(T, scene, { sound, blast, limit = 12 } = {}) {
    this.T = T;
    this.scene = scene;
    this.sound = sound;
    this.blast = blast;
    this.limit = limit;
    this.items = new Map();
    this.seen = new Set();
  }
  add(event, source, now, colliders = []) {
    if (this.seen.has(event.vehicle) || now - event.at > 20000) return;
    this.seen.add(event.vehicle);
    if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value);
    const T = this.T,
      root = source.clone(true);
    root.traverse((o) => {
      o.userData = { projectileSolid: false };
      if (o.geometry) o.geometry = o.geometry.clone();
      if (o.material)
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
    });
    root.position.fromArray(event.p);
    root.quaternion.fromArray(event.q);
    root.visible = true;
    root.userData.projectileSolid = false;
    this.scene.add(root);
    this.items.set(event.vehicle, {
      root,
      v: new T.Vector3().fromArray(event.v),
      age: 0,
      impact: null,
      debris: [],
    });
    let elapsed = Math.max(0, (now - event.at) / 1000);
    while (elapsed > 0 && this.items.has(event.vehicle)) {
      const dt = Math.min(1 / 120, elapsed);
      this.update(dt, colliders, event.vehicle, true);
      elapsed -= dt;
    }
    if (now - event.at < 500 && this.items.has(event.vehicle)) this.sound?.('fall', root.position);
    while (this.items.size > this.limit) this.remove(this.items.keys().next().value);
  }
  remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    for (const root of [item.root, ...item.debris.map((d) => d.mesh)]) {
      this.scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose();
      });
    }
    this.items.delete(id);
  }
  update(dt, colliders, only = null, silent = false) {
    const T = this.T;
    for (const [id, item] of this.items) {
      if (only !== null && id !== only) continue;
      item.age += dt;
      if (item.impact === null) {
        const start = item.root.position.clone();
        item.v.y -= MAP.metres(9.81) * dt;
        item.root.position.addScaledVector(item.v, dt);
        const delta = item.root.position.clone().sub(start),
          length = delta.length(),
          ray = new T.Ray(start, delta.clone().normalize());
        let point =
          item.root.position.y <= 0
            ? new T.Vector3(item.root.position.x, 0, item.root.position.z)
            : null;
        for (const box of colliders) {
          const p = ray.intersectBox(box, new T.Vector3());
          if (
            p &&
            p.distanceTo(start) <= length &&
            (!point || p.distanceTo(start) < point.distanceTo(start))
          )
            point = p;
        }
        item.root.rotateZ(dt * 1.4);
        item.root.rotateX(dt * 0.8);
        if (point || item.age > 16) {
          if (point) item.root.position.copy(point);
          item.impact = item.age;
          if (!silent) {
            this.blast?.(item.root.position);
            this.sound?.('crash', item.root.position);
          }
          for (let i = 0; i < 10; i++) {
            const mesh = new T.Mesh(
              new T.BoxGeometry(MAP.metres(0.5), MAP.metres(0.25), MAP.metres(1)),
              new T.MeshStandardMaterial({ color: i % 2 ? '#6f7960' : '#c1b77b' }),
            );
            mesh.position.copy(item.root.position);
            mesh.userData.projectileSolid = false;
            this.scene.add(mesh);
            item.debris.push({
              mesh,
              v: new T.Vector3(Math.cos(i * 2.4), 0.7 + 0.1 * i, Math.sin(i * 2.4)).multiplyScalar(
                MAP.metres(3),
              ),
            });
          }
        }
      } else {
        const alpha = Math.max(0, 1 - (item.age - item.impact) / 4);
        item.root.traverse((o) => {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m) {
              m.transparent = true;
              m.opacity = alpha;
            }
        });
        for (const d of item.debris) {
          d.v.y -= MAP.metres(9.81) * dt;
          d.mesh.position.addScaledVector(d.v, dt);
          d.mesh.rotation.x += dt * 2;
          if (d.mesh.position.y < 0) d.mesh.position.y = 0;
        }
        if (alpha === 0) this.remove(id);
      }
    }
  }
}
