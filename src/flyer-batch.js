// Rigged Meshy flyers other than the midge (armoured beetle, bee, mosquito), drawn as
// one InstancedMesh per species through their baked flight cycle
// (src/creature-batch.js). Gameplay keeps a cheap Object3D proxy per creature,
// outside the scene; the client turns it towards its 3D movement like a midge.
// The wing beat follows the shared clock, each proxy keeps its own loop offset.
// A new flying species needs its model module and one entry below.
import { CreatureBatch } from './creature-batch.ts';
import { BEETLE, BEETLE_FLIGHT, BEETLE_HIT } from './beetle-model.js';
import { BEE, BEE_FLIGHT, BEE_HIT } from './bee-model.js';
import { MOSQUITO, MOSQUITO_FLIGHT, MOSQUITO_HIT } from './mosquito-model.js';
import { FLYER_HIT_TOLERANCE } from './scale.ts';
import { hitUserData } from './insect-hits.ts';

export const FLYERS = Object.freeze({
  brute: { creature: BEETLE, flight: BEETLE_FLIGHT, hit: BEETLE_HIT },
  guard: { creature: BEE, flight: BEE_FLIGHT, hit: BEE_HIT },
  mosquito: { creature: MOSQUITO, flight: MOSQUITO_FLIGHT, hit: MOSQUITO_HIT },
});

export class FlyerBatch {
  constructor(T, scene, { enabled = true, shadows = true, vats = {} } = {}) {
    this.T = T;
    this.enabled = enabled;
    this.batches = {};
    this.matrix = new T.Matrix4();
    if (!enabled) return;
    for (const [type, flyer] of Object.entries(FLYERS))
      this.batches[type] = new CreatureBatch(T, scene, flyer.creature, {
        name: flyer.creature.name + 's',
        shadows,
        vat: vats[type],
      });
  }
  handles(type) {
    return this.enabled && !!FLYERS[type];
  }
  create(type, phase = 0) {
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
  flush(insects, now = 0) {
    if (!this.enabled) return;
    const counts = {};
    for (const model of insects.values()) {
      const type = model.userData.enemyType;
      if (model.userData.instancedFlyer && model.visible) counts[type] = (counts[type] || 0) + 1;
    }
    for (const [type, batch] of Object.entries(this.batches)) batch.begin(counts[type] || 0);
    for (const model of insects.values()) {
      if (!model.userData.instancedFlyer || !model.visible) continue;
      this.matrix.compose(model.position, model.quaternion, model.scale);
      this.batches[model.userData.enemyType].add(this.matrix, model.userData.loopPhase);
    }
    for (const [type, batch] of Object.entries(this.batches))
      batch.end(now / 1000 / FLYERS[type].flight.loop);
  }
  dispose() {
    for (const batch of Object.values(this.batches)) batch.dispose();
    this.batches = {};
  }
}
