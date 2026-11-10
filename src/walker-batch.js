// Rigged ground walkers (ant, egg-laying spider) drawn as one InstancedMesh
// per species through their baked walk cycle (src/creature-batch.js). Gameplay
// keeps a cheap Object3D proxy per creature, outside the scene: its heading
// follows its horizontal movement and its gait phase advances with the
// distance travelled, so feet stay planted whatever the server speed. A
// creature that stops (glue, bait, stall) settles into the nearest planted pose.
import { CreatureBatch } from './creature-batch.js';
import { ANT, ANT_BONES, ANT_HIT, ANT_MODEL } from './ant-model.js';
import { SPIDER, SPIDER_BONES, SPIDER_HIT, SPIDER_MODEL } from './spider-model.js';
import { nearestRest } from './walker-gait.js';
import { TAU } from './rigged-creature.js';

export const WALKERS = Object.freeze({
  ant: { creature: ANT, model: ANT_MODEL, hit: ANT_HIT, bones: ANT_BONES },
  spider: { creature: SPIDER, model: SPIDER_MODEL, hit: SPIDER_HIT, bones: SPIDER_BONES },
});
// Stride of one cycle in world units for a proxy or model scaled by `scale`.
export const walkerStride = (type, scale = 1) =>
  WALKERS[type].model.stride * WALKERS[type].model.scale * Math.abs(scale);
export const SETTLE_RATE = 6; // 1/s towards the nearest planted pose when stopped

export class WalkerBatch {
  constructor(T, scene, { enabled = true, shadows = true } = {}) {
    this.T = T;
    this.scene = scene;
    this.enabled = enabled;
    this.batches = {};
    if (!enabled) return;
    for (const [type, walker] of Object.entries(WALKERS))
      this.batches[type] = new CreatureBatch(T, scene, walker.creature, {
        name: walker.creature.name + 's',
        shadows,
      });
    this.forward = new T.Vector3(0, 0, -1);
    this.heading = new T.Vector3();
    this.target = new T.Quaternion();
    this.matrix = new T.Matrix4();
  }
  handles(type) {
    return !!WALKERS[type];
  }
  create(type, phase = 0) {
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
  step(model, dx, dz, dt) {
    const u = model.userData;
    const moved = Math.hypot(dx, dz);
    if (u.hasPosition && moved > 1e-9) {
      this.heading.set(dx, 0, dz).normalize();
      this.target.setFromUnitVectors(this.forward, this.heading);
      model.quaternion.slerp(this.target, 0.25);
      const cycles = moved / walkerStride(u.enemyType, model.scale.x);
      u.walkPhase = (u.walkPhase + Math.min(cycles, WALKERS[u.enemyType].model.maxRate * dt)) % 1;
    } else if (u.hasPosition) {
      const rest = nearestRest(u.walkPhase);
      u.walkPhase += (rest - u.walkPhase) * Math.min(1, dt * SETTLE_RATE);
      u.walkPhase = ((u.walkPhase % 1) + 1) % 1;
    }
  }
  flush(insects) {
    if (!this.enabled) return;
    const counts = {};
    for (const model of insects.values()) {
      const type = model.userData.enemyType;
      if (model.userData.instancedWalker && model.visible) counts[type] = (counts[type] || 0) + 1;
    }
    for (const [type, batch] of Object.entries(this.batches)) batch.begin(counts[type] || 0);
    for (const model of insects.values()) {
      if (!model.userData.instancedWalker || !model.visible) continue;
      this.matrix.compose(model.position, model.quaternion, model.scale);
      this.batches[model.userData.enemyType].add(this.matrix, model.userData.walkPhase);
    }
    for (const batch of Object.values(this.batches)) batch.end(0);
  }
  dispose() {
    for (const batch of Object.values(this.batches)) batch.dispose();
    this.batches = {};
  }
}
