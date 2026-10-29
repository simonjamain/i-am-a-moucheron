// Projectile collisions use physical meshes only. Sprites are UI billboards:
// raycasting them requires a camera and would make hitboxes view-dependent.
export function nearestMeshHit(ray, model) {
  model.updateWorldMatrix(true, true);
  const meshes = [];
  model.traverseVisible((part) => {
    if (part.isMesh && part.userData.projectileSolid !== false) meshes.push(part);
  });
  return ray.intersectObjects(meshes, false)[0] ?? null;
}

// Use the rendered triangles, including animated wings, instead of a distance-
// dependent aim cone. Returned distance is measured from the gun muzzle.
export function nearestInsectHit(T, origin, direction, insects, maxDistance = 60) {
  if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 1e-12) return null;
  const ray = new T.Raycaster(origin, direction.clone().normalize(), 0, maxDistance);
  let nearest = null;
  for (const [id, model] of insects) {
    if (!model.visible) continue;
    const hit = nearestMeshHit(ray, model);
    if (hit && (!nearest || hit.distance < nearest.distance))
      nearest = { id, distance: hit.distance, point: hit.point };
  }
  return nearest;
}

// Small aircraft collision probe against the visible ellipsoids. Padding is
// the aircraft body's radius, not an oversized radius around the insect.
export function insectContact(T, point, model, padding = 0.3) {
  model.updateWorldMatrix(true, true);
  const centre = model.getWorldPosition(new T.Vector3()),
    size = model.getWorldScale(new T.Vector3());
  if (point.distanceToSquared(centre) > (2 * Math.max(size.x, size.y, size.z) + padding) ** 2)
    return false;
  for (const part of model.userData.hitParts || []) {
    const radius = part.geometry.parameters.radius,
      scale = part.getWorldScale(new T.Vector3());
    const local = point.clone().applyMatrix4(new T.Matrix4().copy(part.matrixWorld).invert());
    const distance = ['x', 'y', 'z'].reduce(
      (sum, axis) =>
        sum + (local[axis] / (radius + padding / Math.max(1e-6, Math.abs(scale[axis])))) ** 2,
      0,
    );
    if (distance <= 1) return true;
  }
  return false;
}

export class HitEffects {
  constructor(T, scene, { maxBursts = 16, scale = 1 } = {}) {
    this.T = T;
    this.scale = scale;
    this.scene = scene;
    this.maxBursts = maxBursts;
    this.active = [];
    this.seen = new Set();
    this.spark = new T.OctahedronGeometry(0.075, 0);
    this.ring = new T.TorusGeometry(0.3, 0.025, 4, 20);
    this.flash = new T.SphereGeometry(0.2, 8, 6);
  }
  burst(point, camera, { key } = {}) {
    if (key && this.seen.has(key)) return false;
    if (key) {
      this.seen.add(key);
      if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    }
    if (this.active.length >= this.maxBursts) this.remove(this.active[0]);
    const T = this.T,
      group = new T.Group(),
      material = new T.MeshBasicMaterial({
        color: '#ffe69a',
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
    group.position.copy(point);
    group.scale.setScalar(this.scale);
    this.scene.add(group);
    const flash = new T.Mesh(this.flash, material),
      ring = new T.Mesh(this.ring, material);
    group.add(flash, ring);
    ring.quaternion.copy(camera.quaternion);
    const sparks = [];
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996,
        y = 1 - (2 * (i + 0.5)) / 9,
        r = Math.sqrt(1 - y * y),
        mesh = new T.Mesh(this.spark, material);
      group.add(mesh);
      sparks.push({
        mesh,
        velocity: new T.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r).multiplyScalar(2.5),
      });
    }
    this.active.push({ group, material, flash, ring, sparks, age: 0 });
    return true;
  }
  update(dt, camera) {
    for (const effect of [...this.active]) {
      effect.age += dt;
      const progress = effect.age / 0.45;
      if (progress >= 1) {
        this.remove(effect);
        continue;
      }
      effect.material.opacity = (1 - progress) ** 2;
      effect.flash.scale.setScalar(Math.max(0, 1 - effect.age / 0.09));
      effect.ring.quaternion.copy(camera.quaternion);
      effect.ring.scale.setScalar(0.5 + progress * 3);
      for (const spark of effect.sparks) {
        spark.mesh.position.addScaledVector(spark.velocity, dt);
        spark.velocity.multiplyScalar(Math.exp(-3 * dt));
        spark.mesh.scale.setScalar(1 - progress);
      }
    }
  }
  remove(effect) {
    this.scene.remove(effect.group);
    effect.material.dispose();
    this.active.splice(this.active.indexOf(effect), 1);
  }
  clear() {
    for (const effect of [...this.active]) this.remove(effect);
    this.seen.clear();
  }
  dispose() {
    this.clear();
    this.spark.dispose();
    this.ring.dispose();
    this.flash.dispose();
  }
}
