import type * as THREE from 'three';
import { MAP } from './scale.ts';
import type { Three } from './types.ts';

export type TracerPart = THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
/** Tracer userData: geometry metrics, the two passes and pool / hitscan bookkeeping. */
export interface TracerData {
  length: number;
  width: number;
  halo: TracerPart;
  core: TracerPart;
  dispose(): void;
  /** Pooled tracers: the original dispose, freeing GPU resources. */
  destroy?: () => void;
  shell?: boolean;
  released?: boolean;
}
/** Hitscan presentation state added by `moveShotTrace`. */
export interface ShotTraceData {
  shotOrigin: THREE.Vector3;
  shotDirection: THREE.Vector3;
  shotDistance: number;
  shotScale: number;
  born: number;
  until: number;
}
export type Tracer = THREE.Group & { userData: TracerData & Partial<ShotTraceData> };
type TracerBatch = THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> & {
  userData: { shell: boolean; part: 'halo' | 'core' };
};
export const TRACER_COLOR = '#ffad32';
export const TRACER_EDGE = '#402315';
// World-space luminous streaks; visibility never changes swept collision rays.
export function makeTracer(
  T: Three,
  scene: THREE.Object3D,
  position: THREE.Vector3,
  direction: THREE.Vector3,
  color: THREE.ColorRepresentation = TRACER_COLOR,
  shell = false,
): Tracer {
  const root = new T.Group() as Tracer,
    length = MAP.metres(shell ? 7 : 11),
    width = MAP.metres(shell ? 0.14 : 0.09);
  const material = new T.MeshBasicMaterial({
    color: TRACER_EDGE,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: T.NormalBlending,
    toneMapped: false,
  });
  const halo = new T.Mesh(new T.CylinderGeometry(width * 0.9, width * 0.55, length, 6), material);
  halo.rotation.x = Math.PI / 2;
  halo.position.z = -length / 2;
  const coreMaterial = new T.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  });
  const core = new T.Mesh(
    new T.CylinderGeometry(width * 0.55, width * 0.3, length * 0.85, 5),
    coreMaterial,
  );
  // Both passes stay depth-tested and fogged. Draw the dark edge first, then
  // the luminous core, in both ordinary meshes and the instanced pool.
  core.renderOrder = 1;
  core.rotation.x = Math.PI / 2;
  core.position.z = -length * 0.425;
  root.add(halo, core);
  root.position.copy(position);
  root.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction);
  root.userData = {
    length,
    width,
    halo,
    core,
    dispose() {
      for (const part of [halo, core]) {
        part.geometry.dispose();
        part.material.dispose();
      }
    },
  };
  scene.add(root);
  return root;
}
export function updateTracer(
  T: Three,
  root: Tracer,
  direction: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): void {
  root.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction);
  // A minimum projected width keeps distant small-calibre tracers legible.
  const pixel =
    (2 * root.position.distanceTo(camera.position) * Math.tan((camera.fov * Math.PI) / 360)) /
    Math.max(1, globalThis.innerHeight || 900);
  const scale = Math.max(1, (pixel * 2) / (root.userData.width * 1.1));
  root.scale.set(scale, scale, 1);
}

// Static hitscan effects use the same trailing shape, with the head placed in
// front of the muzzle. Moving bullets retain their ordinary rearward tail.
export function makeShotTrace(
  T: Three,
  scene: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  color: THREE.ColorRepresentation,
  scale: number = MAP.ratio,
  distance: number = 150 * scale,
): Tracer {
  const trace = makeTracer(T, scene, origin, direction, color);
  const length = Math.min(11 * scale, distance);
  trace.scale.set(scale / MAP.ratio, scale / MAP.ratio, length / trace.userData.length);
  trace.position.addScaledVector(direction, length);
  return trace;
}
export class TracerPool {
  T!: Three;
  scene!: THREE.Object3D;
  limit!: number;
  instanced!: boolean;
  batches: Map<boolean, TracerBatch[]>;
  free: Tracer[];
  all: Set<Tracer>;

  constructor(
    T: Three,
    scene: THREE.Object3D,
    limit = 256,
    { instanced = false }: { instanced?: boolean } = {},
  ) {
    Object.assign(this, { T, scene, limit, instanced });
    this.batches = new Map();
    this.free = [];
    this.all = new Set();
  }
  acquire(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: THREE.ColorRepresentation | null | undefined = TRACER_COLOR,
    shell = false,
  ): Tracer | null {
    let model = this.free.find((m) => m.userData.shell === shell);
    if (model) this.free.splice(this.free.indexOf(model), 1);
    else {
      if (this.all.size >= this.limit) {
        const old = this.free.pop();
        if (!old) return null;
        old.userData.destroy!();
        this.all.delete(old);
      }
      model = makeTracer(
        this.T,
        this.scene,
        position,
        direction,
        color as THREE.ColorRepresentation,
        shell,
      );
      const destroy = model.userData.dispose;
      model.userData.destroy = destroy;
      model.userData.shell = shell;
      model.userData.dispose = () => {
        if (!model!.userData.released) {
          model!.userData.released = true;
          this.scene.remove(model!);
          this.free.push(model!);
        }
      };
      this.all.add(model);
    }
    model.userData.released = false;
    model.userData.core.material.color.set(color ?? TRACER_COLOR);
    model.position.copy(position);
    model.scale.set(1, 1, 1);
    if (this.instanced) {
      this.scene.remove(model);
      this.prepareBatch(model);
    } else this.scene.add(model);
    return model;
  }
  prepareBatch(model: Tracer): void {
    const shell = model.userData.shell!;
    if (this.batches.has(shell)) return;
    const T = this.T;
    const parts = (['halo', 'core'] as const).map((part) => {
      const source = model.userData[part];
      const material = source.material.clone();
      // Color belongs to each instance, not to the shared core material.
      if (part === 'core') material.color.set('#ffffff');
      const mesh = new T.InstancedMesh(
        source.geometry.clone(),
        material,
        this.limit,
      ) as TracerBatch;
      mesh.renderOrder = source.renderOrder;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData = { shell, part };
      this.scene.add(mesh);
      return mesh;
    });
    this.batches.set(shell, parts);
  }
  // Submit only once after all ballistic substeps, immediately before rendering.
  flush(): void {
    if (!this.instanced) return;
    for (const [shell, parts] of this.batches) {
      let count = 0;
      for (const model of this.all) {
        if (model.userData.released || model.userData.shell !== shell) continue;
        model.updateWorldMatrix(true, true);
        for (const mesh of parts) {
          const source = model.userData[mesh.userData.part];
          mesh.setMatrixAt(count, source.matrixWorld);
          if (mesh.userData.part === 'core') mesh.setColorAt(count, source.material.color);
        }
        count++;
      }
      for (const mesh of parts) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  dispose(): void {
    for (const parts of this.batches.values())
      for (const mesh of parts) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    this.batches.clear();
    for (const model of this.all) {
      this.scene.remove(model);
      model.userData.destroy!();
    }
    this.all.clear();
    this.free = [];
  }
}

// Presentation of the existing hitscan: forward motion stops at its resolved hit.
export function moveShotTrace(
  T: Three,
  trace: Tracer,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  scale: number,
  distance: number,
  now: number,
): void {
  Object.assign(trace.userData, {
    shotOrigin: origin.clone(),
    shotDirection: direction.clone(),
    shotDistance: distance,
    shotScale: scale,
    born: now,
    until: now + (distance / (820 * scale)) * 1000,
  });
  trace.position.copy(origin);
  trace.scale.z = 0;
}
export function advanceShotTrace(
  T: Three,
  trace: Tracer,
  now: number,
  camera: THREE.PerspectiveCamera,
): boolean {
  const d = trace.userData as TracerData & ShotTraceData;
  const travelled = Math.min(
    d.shotDistance,
    Math.max(0, ((now - d.born) / 1000) * 820 * d.shotScale),
  );
  trace.position.copy(d.shotOrigin).addScaledVector(d.shotDirection, travelled);
  updateTracer(T, trace, d.shotDirection, camera);
  trace.scale.z = Math.min(11 * d.shotScale, travelled) / d.length;
  return now < d.until;
}
