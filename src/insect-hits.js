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

// Rebuilt lazily once after each enemy animation frame, shared by all shots.
// Spheres cover every overlapped cell; ray queries walk cells, never triangles.
export class InsectIndex {
  constructor(T, insects, cellSize = 0.08) {
    if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw Error('Invalid cell size');
    Object.assign(this, { T, insects, cellSize });
    this.dirty = true;
    this.buckets = new Map();
    this.overflow = [];
    this.centre = new T.Vector3();
    this.size = new T.Vector3();
  }
  invalidate() {
    this.dirty = true;
  }
  rebuild() {
    this.scan = false;
    this.buckets.clear();
    this.overflow.length = 0;
    let order = 0;
    for (const [id, model] of this.insects) {
      const row = { id, model, order: order++ };
      const direct = !model.parent || model.parent.isScene;
      const centre = direct ? model.position : model.getWorldPosition(this.centre);
      const size = direct ? model.scale : model.getWorldScale(this.size);
      const r =
        3 *
          Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)) *
          (model.userData.hitTolerance || 1) +
        this.cellSize * 1e-9;
      const min = ['x', 'y', 'z'].map((a) => Math.floor((centre[a] - r) / this.cellSize));
      const max = ['x', 'y', 'z'].map((a) => Math.floor((centre[a] + r) / this.cellSize));
      // Very large models remain conservative without filling millions of cells.
      if (
        !Number.isFinite(r) ||
        !min.every(Number.isFinite) ||
        !max.every(Number.isFinite) ||
        (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1) > 512
      ) {
        this.overflow.push(row);
        continue;
      }
      for (let x = min[0]; x <= max[0]; x++)
        for (let y = min[1]; y <= max[1]; y++)
          for (let z = min[2]; z <= max[2]; z++) {
            const key = x + ':' + y + ':' + z;
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            const bucket = this.buckets.get(key);
            bucket.push(row);
            if (bucket.length > this.insects.size / 4) {
              this.scan = true;
              this.dirty = false;
              return;
            }
          }
    }
    this.dirty = false;
  }
  query(origin, direction, distance) {
    const h = this.cellSize;
    // Small waves and exceptional/long rays cost less via the reference scan.
    if (
      this.insects.size < 128 ||
      !Number.isFinite(distance) ||
      distance < 0 ||
      distance / h > 2048 ||
      !['x', 'y', 'z'].every((a) => Number.isFinite(origin[a]))
    )
      return this.insects;
    if (this.dirty) this.rebuild();
    if (this.scan) return this.insects;
    const length = direction.length();
    if (!(length > 0)) return this.insects;
    const axes = ['x', 'y', 'z'];
    const cells = axes.map((a) => Math.floor(origin[a] / h));
    const unit = axes.map((a) => direction[a] / length);
    const step = unit.map(Math.sign);
    const delta = unit.map((v) => (v === 0 ? Infinity : h / Math.abs(v)));
    const next = unit.map((v, i) =>
      v === 0 ? Infinity : ((cells[i] + (step[i] > 0 ? 1 : 0)) * h - origin[axes[i]]) / v,
    );
    const found = new Map(this.overflow.map((row) => [row.id, row]));
    for (let n = 0; n < 8192; n++) {
      const key = cells[0] + ':' + cells[1] + ':' + cells[2];
      for (const row of this.buckets.get(key) || []) {
        found.set(row.id, row);
        // In a packed swarm, scanning is cheaper than sorting most of the room.
        if (found.size > this.insects.size / 4) return this.insects;
      }
      const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
      if (next[axis] > distance) break;
      cells[axis] += step[axis];
      next[axis] += delta[axis];
      if (n === 8191) return this.insects;
    }
    // Match Map order for exactly tied hits; deleted enemies cannot reappear.
    return [...found.values()]
      .sort((a, b) => a.order - b.order)
      .filter((row) => this.insects.get(row.id) === row.model)
      .map((row) => [row.id, row.model]);
  }
}

// Use the rendered triangles, including animated wings, instead of a distance-
// dependent aim cone. Returned distance is measured from the gun muzzle.
export function nearestInsectHit(
  T,
  origin,
  direction,
  insects,
  maxDistance = 60,
  excluded = null,
  index = null,
) {
  if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 1e-12) return null;
  const norm = Math.sqrt(direction.lengthSq());
  let ray = null,
    nearest = null;
  for (const [id, model] of index ? index.query(origin, direction, maxDistance) : insects) {
    if (!model.visible || excluded?.has(id)) continue;
    // Broad phase uses a conservative world sphere before any matrix/mesh work.
    const direct = !model.parent || model.parent.isScene;
    const centre = direct ? model.position : model.getWorldPosition(new T.Vector3());
    const size = direct ? model.scale : model.getWorldScale(new T.Vector3());
    const radius =
      3 *
      Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)) *
      (model.userData.hitTolerance || 1);
    const dx = centre.x - origin.x,
      dy = centre.y - origin.y,
      dz = centre.z - origin.z;
    const along = (dx * direction.x + dy * direction.y + dz * direction.z) / norm;
    if (
      along < -radius ||
      along > maxDistance + radius ||
      dx * dx + dy * dy + dz * dz - along * along > radius * radius
    )
      continue;
    ray ??= new T.Raycaster(origin, direction.clone().normalize(), 0, maxDistance);
    let hit;
    if ((model.userData.hitTolerance || 1) > 1) {
      model.updateWorldMatrix(true, true);
      for (const part of model.userData.hitParts || []) {
        const r = part.geometry.parameters.radius;
        if (!r) continue;
        const local = ray.ray.clone().applyMatrix4(new T.Matrix4().copy(part.matrixWorld).invert());
        const point = local.intersectSphere(
          new T.Sphere(new T.Vector3(), r * model.userData.hitTolerance),
          new T.Vector3(),
        );
        if (!point) continue;
        point.applyMatrix4(part.matrixWorld);
        const distance = point.distanceTo(origin);
        if (distance <= maxDistance && (!hit || distance < hit.distance)) hit = { point, distance };
      }
    } else hit = nearestMeshHit(ray, model);
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
