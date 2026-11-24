// Rigged Meshy flyers other than the midge (armoured beetle, bee, mosquito), drawn as
// one InstancedMesh per species through their baked flight cycle
// (src/creature-batch.ts). Gameplay keeps a cheap Object3D proxy per creature,
// outside the scene; the client turns it towards its 3D movement like a midge.
// The wing beat follows the shared clock, each proxy keeps its own loop offset.
// A new flying species needs its model module and one entry below.
import { CreatureBatch, type CreatureVat } from './creature-batch.ts';
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { BEETLE, BEETLE_FLIGHT, BEETLE_HIT } from './beetle-model.ts';
import { BEE, BEE_FLIGHT, BEE_HIT } from './bee-model.ts';
import { MOSQUITO, MOSQUITO_FLIGHT, MOSQUITO_HIT } from './mosquito-model.ts';
import { FLYER_HIT_TOLERANCE } from './scale.ts';
import { hitUserData } from './insect-hits.ts';

export const FLYERS = Object.freeze({
  brute: { creature: BEETLE, flight: BEETLE_FLIGHT, hit: BEETLE_HIT },
  guard: { creature: BEE, flight: BEE_FLIGHT, hit: BEE_HIT },
  mosquito: { creature: MOSQUITO, flight: MOSQUITO_FLIGHT, hit: MOSQUITO_HIT },
});

/** Flying species drawn by this batch (every flyer but the midge). */
export type FlyerType = keyof typeof FLYERS;

export class FlyerBatch {
  T: Three;
  enabled: boolean;
  batches: Partial<Record<FlyerType, CreatureBatch>>;
  matrix: THREE.Matrix4;
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
      vats?: Partial<Record<FlyerType, CreatureVat | null>>;
    } = {},
  ) {
    this.T = T;
    this.enabled = enabled;
    this.batches = {};
    this.matrix = new T.Matrix4();
    if (!enabled) return;
    for (const [type, flyer] of Object.entries(FLYERS) as [FlyerType, (typeof FLYERS)[FlyerType]][])
      this.batches[type] = new CreatureBatch(T, scene, flyer.creature, {
        name: flyer.creature.name + 's',
        shadows,
        vat: vats[type],
      });
  }
  handles(type: string): type is FlyerType {
    return this.enabled && !!FLYERS[type as FlyerType];
  }
  create(type: FlyerType, phase = 0): THREE.Object3D {
    const flyer = FLYERS[type];
    const model = new this.T.Object3D();
    model.userData = {
      enemyType: type,
      instancedFlyer: true,
      ...hitUserData(flyer.hit),
      hitTolerance: FLYER_HIT_TOLERANCE,
      phase,
      // Loop offset in [0, 1): neighbours beat out of step.
      loopPhase: (((phase * 0.6180339887) % 1) + 1) % 1,
      wings: [],
      legs: [],
      disposables: [],
    };
    // This object is only an inexpensive logical transform; it never enters the scene.
    return model;
  }
  // `now` in ms drives the shared wing-beat clock.
  flush(insects: ReadonlyMap<unknown, THREE.Object3D>, now = 0): void {
    if (!this.enabled) return;
    const counts: Record<string, number> = {};
    for (const model of insects.values()) {
      const type = model.userData.enemyType;
      if (model.userData.instancedFlyer && model.visible) counts[type] = (counts[type] || 0) + 1;
    }
    const batches = Object.entries(this.batches) as [FlyerType, CreatureBatch][];
    for (const [type, batch] of batches) batch.begin(counts[type] || 0);
    for (const model of insects.values()) {
      if (!model.userData.instancedFlyer || !model.visible) continue;
      this.matrix.compose(model.position, model.quaternion, model.scale);
      this.batches[model.userData.enemyType as FlyerType]!.add(
        this.matrix,
        model.userData.loopPhase,
      );
    }
    for (const [type, batch] of batches) batch.end(now / 1000 / FLYERS[type].flight.loop);
  }
  dispose(): void {
    for (const batch of Object.values(this.batches)) batch.dispose();
    this.batches = {};
  }
}
