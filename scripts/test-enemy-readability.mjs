import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { ENEMY_TYPES, wavePlan, swarmFrame } from '../src/waves.js';
import { INSECT_SCALE } from '../src/scale.js';
import { insectScale } from '../src/insect-status.js';
const graphics = createGraphics(T, new T.Scene());
const camera = new T.PerspectiveCamera(62, 1920 / 1080, 0.00005, 40);
const rows = [];
for (const [type, profile] of Object.entries(ENEMY_TYPES)) {
  const model = graphics.insect(type);
  model.scale.setScalar(insectScale(type, INSECT_SCALE, profile.size));
  const box = new T.Box3().setFromObject(model),
    size = box.getSize(new T.Vector3());
  // Equal frontal view at 2 world metres, 1080p, actual rendered triangles/bounds.
  const centre = box.getCenter(new T.Vector3());
  camera.position.copy(centre).add(new T.Vector3(0, 0, 2));
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  const projected = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        projected.push(new T.Vector3(x, y, z).project(camera));
  const pixelsX =
    (Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x))) * 960;
  const pixelsY =
    (Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y))) * 540;
  rows.push({
    type,
    widthMM: +(size.x * 1000).toFixed(2),
    heightMM: +(size.y * 1000).toFixed(2),
    lengthMM: +(size.z * 1000).toFixed(2),
    pixelsX: +pixelsX.toFixed(2),
    pixelsY: +pixelsY.toFixed(2),
  });
}
console.table(rows);
const unreadable = rows.filter(
  (row) =>
    row.pixelsX < (row.type === 'ant' ? 5 : 6) || row.pixelsY < (row.type === 'ant' ? 1.7 : 2),
);
assert.deepEqual(
  unreadable.map((r) => r.type),
  [],
  'Ants meet the requested half-size; other enemy silhouettes exceed 6×2 pixels at 2 m / 1080p without zoom',
);

// Use the real swarm positions and complete ground meshes, including feet.
// The floor has decorative seams reaching y=0.0004 m, not just y=0.
for (const wave of [1, 2, 6, 12]) {
  const roster = wavePlan('GROUND-READABILITY', wave, 123).roster;
  for (const enemy of roster.filter((e) => e.ground)) {
    const model = graphics.insect(enemy.type);
    model.scale.setScalar(insectScale(enemy.type, INSECT_SCALE, enemy.size));
    for (const fraction of [0, 0.01, 0.2, 0.5, 0.8, 0.95, 0.999]) {
      const time = enemy.spawn + (enemy.duration - 0.001) * fraction;
      const sample = swarmFrame(roster, time)[enemy.id];
      assert.ok(sample);
      model.position.fromArray(sample.p);
      const box = new T.Box3().setFromObject(model);
      assert.ok(box.min.y > 0.0004, 'All feet must clear the real floor and its decorative seams');
      const feetY = Math.min(
        ...model.userData.legs.map((leg) => new T.Box3().setFromObject(leg).min.y),
      );
      assert.ok(
        Math.abs(box.min.y - feetY) < 1e-6,
        'Feet, not the abdomen, must be the lowest physical geometry',
      );
      if (feetY < 0.00071)
        assert.ok(
          Math.abs(sample.dir[1]) < 1e-8,
          'Flat-ground movement must retain a horizontal tangent',
        );
    }
  }
}
console.log(
  'Actual ground models and feet clear the complete floor across spawn, route and final climb; flat-ground tangents remain horizontal.',
);
