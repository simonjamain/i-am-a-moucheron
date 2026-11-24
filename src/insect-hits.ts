import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

export type HitUserData =
  { sphereRadius: number } | { hitEllipsoid: number[]; hitCentre: number[] };

/** A solid model prepared once per frame (see solidTarget). */
export interface SolidTarget<E extends object = Record<string, unknown>> {
  model: THREE.Object3D;
  meshes: THREE.Mesh[];
  box: THREE.Box3;
  extra: E;
}

interface HitBurst {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  flash: THREE.Mesh;
  ring: THREE.Mesh;
  sparks: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[];
  age: number;
}

// Projectile collisions use physical meshes only. Sprites are UI billboards:
// raycasting them requires a camera and would make hitboxes view-dependent.
export function nearestMeshHit(
  ray: THREE.Raycaster,
  model: THREE.Object3D,
): THREE.Intersection | null {
  model.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  model.traverseVisible((part) => {
    if ((part as THREE.Mesh).isMesh && part.userData.projectileSolid !== false)
      meshes.push(part as THREE.Mesh);
  });
  return ray.intersectObjects(meshes, false)[0] ?? null;
}

// A solid target (vehicle, pilot) prepared once per frame for every projectile
// slice of that frame: its world matrices are refreshed once, its solid meshes
// listed once, and a padded world box (the animated pose can leave the bind-pose
// box) rejects the rays that cannot touch it before any triangle is tested.
export function solidTarget<E extends object>(
  T: Three,
  model: THREE.Object3D,
  extra: E,
  padding = 0.3,
): SolidTarget<E> | null {
  model.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [],
    box = new T.Box3();
  model.traverseVisible((part) => {
    if (!(part as THREE.Mesh).isMesh || part.userData.projectileSolid === false) return;
    meshes.push(part as THREE.Mesh);
    box.union(new T.Box3().setFromObject(part));
  });
  if (!meshes.length) return null;
  const size = box.getSize(new T.Vector3());
  box.expandByVector(size.multiplyScalar(padding));
  return { model, meshes, box, extra };
}
const boxPoint: THREE.Vector3[] = [];
// Nearest triangle hit over prepared targets within the ray's `far`. `skip`
// excludes the target whose extra.vehicle equals it (the shooter's own vehicle).
// Same order and tie rule as testing each model in turn with nearestMeshHit.
export function nearestSolidHit<E extends { vehicle?: unknown }>(
  T: Three,
  ray: THREE.Raycaster,
  targets: Iterable<SolidTarget<E>>,
  skipVehicle: unknown = undefined,
): (THREE.Intersection & E) | null {
  const point = (boxPoint[0] ??= new T.Vector3());
  let best: (THREE.Intersection & E) | null = null;
  for (const target of targets) {
    if (skipVehicle !== undefined && target.extra.vehicle === skipVehicle) continue;
    if (!target.box.containsPoint(ray.ray.origin)) {
      if (!ray.ray.intersectBox(target.box, point)) continue;
      if (point.distanceToSquared(ray.ray.origin) > ray.far * ray.far) continue;
    }
    const hit = ray.intersectObjects(target.meshes, false)[0];
    if (hit && (!best || hit.distance < best.distance)) best = { ...hit, ...target.extra };
  }
  return best;
}

// Hit-volume user data of a species: equal radii on the origin make a sphere
// (cheap ray test, no matrix); anything else is an ellipsoid. The sphere is
// stored like the midge's, whose radius is normalised by 1.2 (see hitRadius).
export function hitUserData({
  centre,
  radii,
}: {
  centre: readonly number[];
  radii: readonly number[];
}): HitUserData {
  const [r] = radii;
  if (radii.every((v) => v === r) && centre.every((v) => v === 0)) return { sphereRadius: r * 1.2 };
  return { hitEllipsoid: [...radii], hitCentre: [...centre] };
}

export class HitEffects {
  T: Three;
  scale: number;
  scene: THREE.Object3D;
  maxBursts: number;
  active: HitBurst[];
  seen: Set<unknown>;
  spark: THREE.OctahedronGeometry;
  ring: THREE.TorusGeometry;
  flash: THREE.SphereGeometry;
  constructor(
    T: Three,
    scene: THREE.Object3D,
    { maxBursts = 16, scale = 1 }: { maxBursts?: number; scale?: number } = {},
  ) {
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
  burst(point: THREE.Vector3, camera: THREE.Camera, { key }: { key?: unknown } = {}): boolean {
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
    const sparks: HitBurst['sparks'] = [];
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
  update(dt: number, camera: THREE.Camera): void {
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
  remove(effect: HitBurst): void {
    this.scene.remove(effect.group);
    effect.material.dispose();
    this.active.splice(this.active.indexOf(effect), 1);
  }
  clear(): void {
    for (const effect of [...this.active]) this.remove(effect);
    this.seen.clear();
  }
  dispose(): void {
    this.clear();
    this.spark.dispose();
    this.ring.dispose();
    this.flash.dispose();
  }
}
