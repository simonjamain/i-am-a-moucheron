// Rigged ground walkers (ant, egg-laying spider, spiderling, cockroach, rat) drawn as one InstancedMesh
// per species through their baked walk cycle (src/creature-batch.ts). Gameplay
// keeps a cheap Object3D proxy per creature, outside the scene: its heading
// follows its horizontal movement and its gait phase advances with the
// distance travelled, so feet stay planted whatever the server speed. A
// creature that stops (glue, bait, stall) settles into the nearest planted pose.
import { CreatureBatch, type CreatureVat } from './creature-batch.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { ANT, ANT_BONES, ANT_HIT, ANT_MODEL } from './ant-model.ts';
import { SPIDER, SPIDER_BONES, SPIDER_HIT, SPIDER_MODEL } from './spider-model.ts';
import { ROACH, ROACH_BONES, ROACH_HIT, ROACH_MODEL } from './roach-model.ts';
import { RAT, RAT_BONES, RAT_HIT, RAT_MODEL } from './rat-model.ts';
import {
  SPIDERLING,
  SPIDERLING_BONES,
  SPIDERLING_HIT,
  SPIDERLING_MODEL,
} from './spiderling-model.ts';
import { nearestRest } from './walker-gait.ts';
import { TAU } from './rigged-creature.ts';

export const WALKERS = Object.freeze({
  ant: { creature: ANT, model: ANT_MODEL, hit: ANT_HIT, bones: ANT_BONES },
  spider: { creature: SPIDER, model: SPIDER_MODEL, hit: SPIDER_HIT, bones: SPIDER_BONES },
  roach: { creature: ROACH, model: ROACH_MODEL, hit: ROACH_HIT, bones: ROACH_BONES },
  spiderling: {
    creature: SPIDERLING,
    model: SPIDERLING_MODEL,
    hit: SPIDERLING_HIT,
    bones: SPIDERLING_BONES,
  },
  // The rat replays its own Meshy walking clip instead of a procedural gait.
  rat: { creature: RAT, model: RAT_MODEL, hit: RAT_HIT, bones: RAT_BONES, clip: true },
});
/** Ground species drawn by this batch (every ground species). */
export type WalkerType = keyof typeof WALKERS;
// Stride of one cycle in world units for a proxy or model scaled by `scale`.
export const walkerStride = (type: WalkerType, scale = 1): number =>
  WALKERS[type].model.stride * WALKERS[type].model.scale * Math.abs(scale);
export const SETTLE_RATE = 6; // 1/s towards the nearest planted pose when stopped

export class WalkerBatch {
  T: Three;
  scene: THREE.Object3D;
  enabled: boolean;
  batches: Partial<Record<WalkerType, CreatureBatch>>;
  // Scratch objects, only allocated when the batch is enabled.
  forward!: THREE.Vector3;
  heading!: THREE.Vector3;
  target!: THREE.Quaternion;
  matrix!: THREE.Matrix4;
  constructor(
    T: Three,
    scene: THREE.Object3D,
    {
      enabled = true,
      shadows = true,
      vats = {},
    }: {
      enabled?: boolean;
      shadows?: boolean;
      vats?: Partial<Record<WalkerType, CreatureVat | null>>;
    } = {},
  ) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.batches = {};
    if (!enabled) return;
    for (const [type, walker] of Object.entries(WALKERS) as [
      WalkerType,
      (typeof WALKERS)[WalkerType],
    ][])
      this.batches[type] = new CreatureBatch(T, scene, walker.creature, {
        name: walker.creature.name + 's',
        shadows,
        vat: vats[type],
      });
    this.forward = new T.Vector3(0, 0, -1);
    this.heading = new T.Vector3();
    this.target = new T.Quaternion();
    this.matrix = new T.Matrix4();
  }
  handles(type: string): type is WalkerType {
    return !!WALKERS[type as WalkerType];
  }
  create(type: WalkerType, phase = 0): THREE.Object3D {
    const walker = WALKERS[type];
    const model = new this.T.Object3D();
    model.userData = {
      enemyType: type,
      instancedWalker: true,
      hitEllipsoid: [...walker.hit.radii],
      hitCentre: [...walker.hit.centre],
      hitTolerance: 1,
      phase,
      // Gait phase in [0, 1): neighbours start out of step.
      walkPhase: (((walker.creature.rest + phase / TAU) % 1) + 1) % 1,
      wings: [],
      legs: [],
      disposables: [],
    };
    // This object is only an inexpensive logical transform; it never enters the scene.
    return model;
  }
  // Horizontal move (dx, dz) since the previous frame: turn towards it and
  // advance the gait by the distance covered; ease to a planted pose at rest.
  step(model: THREE.Object3D, dx: number, dz: number, dt: number): void {
    const u = model.userData;
    const moved = Math.hypot(dx, dz);
    if (u.hasPosition && moved > 1e-9) {
      this.heading.set(dx, 0, dz).normalize();
      this.target.setFromUnitVectors(this.forward, this.heading);
      model.quaternion.slerp(this.target, 0.25);
      const cycles = moved / walkerStride(u.enemyType, model.scale.x);
      u.walkPhase =
        (u.walkPhase + Math.min(cycles, WALKERS[u.enemyType as WalkerType].model.maxRate * dt)) % 1;
    } else if (u.hasPosition) {
      const rest = nearestRest(u.walkPhase);
      u.walkPhase += (rest - u.walkPhase) * Math.min(1, dt * SETTLE_RATE);
      u.walkPhase = ((u.walkPhase % 1) + 1) % 1;
    }
  }
  // Debug dummy (debug-enemies.ts): stays put facing `dir`, walking in place at
  // `speed` (metres per second) as if it covered that distance.
  treadmill(model: THREE.Object3D, dir: readonly number[], speed: number, dt: number): void {
    const u = model.userData;
    if (Math.hypot(dir[0], dir[2]) > 1e-9) {
      this.heading.set(dir[0], 0, dir[2]).normalize();
      model.quaternion.setFromUnitVectors(this.forward, this.heading);
    }
    const cycles = (speed * dt) / walkerStride(u.enemyType, model.scale.x);
    u.walkPhase =
      (u.walkPhase + Math.min(cycles, WALKERS[u.enemyType as WalkerType].model.maxRate * dt)) % 1;
  }
  flush(insects: ReadonlyMap<unknown, THREE.Object3D>): void {
    if (!this.enabled) return;
    const counts: Record<string, number> = {};
    for (const model of insects.values()) {
      const type = model.userData.enemyType;
      if (model.userData.instancedWalker && model.visible) counts[type] = (counts[type] || 0) + 1;
    }
    for (const [type, batch] of Object.entries(this.batches) as [WalkerType, CreatureBatch][])
      batch.begin(counts[type] || 0);
    for (const model of insects.values()) {
      if (!model.userData.instancedWalker || !model.visible) continue;
      this.matrix.compose(model.position, model.quaternion, model.scale);
      this.batches[model.userData.enemyType as WalkerType]!.add(
        this.matrix,
        model.userData.walkPhase,
      );
    }
    for (const batch of Object.values(this.batches)) batch.end(0);
  }
  dispose(): void {
    for (const batch of Object.values(this.batches)) batch.dispose();
    this.batches = {};
  }
}
