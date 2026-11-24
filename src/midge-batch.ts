// Midges are drawn in one batch, with cheap Object3D proxies for gameplay; proxies
// stay outside the render scene so thousands of midges share a single draw call.
// Every midge uses the rigged Meshy model through a vertex animation texture
// (src/creature-batch.ts, cycle in src/midge-model.ts), whatever its distance: there
// is deliberately no level of detail. A future one will be uniform for all creatures.
import { MIDGE_HIT_TOLERANCE, MIDGE_SPHERE_RADIUS } from './scale.ts';
import { MIDGE, MIDGE_FLIGHT } from './midge-model.ts';
import { CreatureBatch, type CreatureVat } from './creature-batch.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

export class MidgeBatch {
  T: Three;
  scene: THREE.Object3D;
  enabled: boolean;
  detail: CreatureBatch | null;
  root?: THREE.Matrix4;
  constructor(
    T: Three,
    scene: THREE.Object3D,
    { enabled = true, vat = null }: { enabled?: boolean; vat?: CreatureVat | null } = {},
  ) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.detail = null;
    if (!enabled) return;
    this.root = new T.Matrix4();
    this.detail = new CreatureBatch(T, scene, MIDGE, { name: 'moucherons', vat });
  }
  create(phase = 0): THREE.Object3D {
    const model = new this.T.Object3D();
    model.userData = {
      enemyType: 'midge',
      instancedMidge: true,
      sphereRadius: MIDGE_SPHERE_RADIUS,
      // Loop offset in [0, 1): each midge beats out of step with its neighbours.
      phase,
      loopPhase: (((phase * 0.6180339887) % 1) + 1) % 1,
      hitTolerance: MIDGE_HIT_TOLERANCE,
      wings: [],
      legs: [],
      disposables: [],
    };
    // This object is only an inexpensive logical transform; it never enters the scene.
    return model;
  }
  // `now` in ms: the shared animation clock.
  flush(insects: ReadonlyMap<unknown, THREE.Object3D>, now = 0): void {
    if (!this.enabled) return;
    let count = 0;
    for (const model of insects.values())
      if (model.userData.instancedMidge && model.visible) count++;
    const detail = this.detail!,
      root = this.root!;
    detail.begin(count);
    for (const model of insects.values()) {
      if (!model.userData.instancedMidge || !model.visible) continue;
      root.compose(model.position, model.quaternion, model.scale);
      detail.add(root, model.userData.loopPhase ?? 0);
    }
    detail.end(now / 1000 / MIDGE_FLIGHT.loop);
  }
  dispose(): void {
    this.detail?.dispose();
    this.detail = null;
  }
}
