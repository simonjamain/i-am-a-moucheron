import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { ENEMY_TYPES, wavePlan, swarmFrame } from '../src/waves.js';
import { insectScale } from '../src/insect-status.js';
import { INSECT_SCALE } from '../src/scale.js';
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const missing = [];
for (const type of Object.keys(ENEMY_TYPES)) {
  const model = graphics.insect(type);
  if (model.parent !== scene) missing.push(type);
}
assert.deepEqual(missing, [], 'Every living enemy model must be attached to the rendered scene');
console.log('All six enemy types attached to the scene.');
for (const wave of [1, 2, 4, 6, 8, 12]) {
  const plan = wavePlan('VISIBLE', wave, 1000);
  assert.ok(plan.roster.some((e) => e.ground));
  for (const enemy of plan.roster) {
    const frame = swarmFrame(plan.roster, enemy.spawn + 0.1)[enemy.id];
    assert.ok(frame && frame.p.every(Number.isFinite));
  }
}
console.log(
  'Ground enemies present from wave one; finite visible spawn frames through wave twelve.',
);
// A live enemy must never be completely swallowed by solid furniture.
import { ROUTE_OBSTACLES } from '../src/route-obstacles.js';
const counts = {};
for (const wave of [1, 2, 4, 6, 8, 12]) {
  const roster = wavePlan('VISIBLE', wave, 1000).roster;
  const end = Math.max(...roster.map((e) => e.spawn + e.duration));
  for (let t = 0; t < end; t += 2) {
    const frame = swarmFrame(roster, t);
    frame.forEach((f, i) => {
      if (!f) return;
      const e = roster[i];
      const r = insectScale(e.type, INSECT_SCALE, e.size) * 0.3;
      const inside = ROUTE_OBSTACLES.find((b) =>
        ['x', 'y', 'z'].every((k, j) => f.p[j] - r > b.min[k] && f.p[j] + r < b.max[k]),
      );
      if (inside) {
        const key = e.type + ':' + (Math.abs(f.p[0]) > 4 || f.p[2] < -3.49 ? 'portal' : 'interior');
        counts[key] = (counts[key] || 0) + 1;
      }
    });
  }
}
console.log('Buried living enemies by species and region:', JSON.stringify(counts));
assert.equal(Object.keys(counts).length, 0, 'Living enemies buried inside furniture');
// Exercise the real render/update entry point, including a missed preparation
// snapshot between waves. Enemy IDs restart at zero but can change species.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/client.js', 'utf8');
const update = source.slice(
  source.indexOf('function enemies(now)'),
  source.indexOf('function vehicleModel(', source.indexOf('function enemies(now)')),
);
const models = new Map();
const testEnemy = (type) => ({
  id: 0,
  type,
  ...ENEMY_TYPES[type],
  phase: 0,
  spawn: 0,
  entryHold: 2,
  duration: 500,
  routeSeed: 123,
  approach: 'full',
});
const state = {
  T,
  scene,
  insects: models,
  insect: graphics.insect,
  snap: {
    wave: 1,
    phase: 'combat',
    sentAt: 10000,
    receivedAt: 0,
    started: 0,
    roster: [testEnemy('midge')],
    total: 1,
    kills: [],
    leaked: 0,
  },
  performance: { now: () => 0 },
  clockOffset: 0,
  currentRoster: () => state.snap.roster,
  swarmFrame,
  localKills: new Set(),
  entryStatus: () => 'in-flight',
  entryNoticeWave: -1,
  notify: () => {},
  insectScale,
  INSECT_SCALE,
  insectStatus: { update() {}, keep() {} },
  localEnemyDamage: new Map(),
  camera: new T.PerspectiveCamera(),
  $: () => ({ textContent: '' }),
};
vm.createContext(state);
vm.runInContext(update + '\nenemies(10000)', state);
state.snap = { ...state.snap, wave: 2, roster: [testEnemy('ant')] };
vm.runInContext('enemies(10000)', state);
assert.equal(
  models.get(0).userData.legs?.length,
  6,
  'Wave two must render its ground enemy, not reuse a flying mesh from wave one',
);
console.log(
  'Actual client renders the right species after consecutive waves without a preparation frame.',
);

const first = wavePlan('VISIBLE', 1, 1000);
assert.equal(first.roster.filter((e) => e.ground).length, 4);
assert.equal(first.roster.filter((e) => e.type === 'midge').length, 4);
const oldModel = graphics.insect('midge'),
  newModel = graphics.insect('midge');
oldModel.scale.setScalar(INSECT_SCALE * 1.35 * 1.5);
newModel.scale.setScalar(insectScale('midge', INSECT_SCALE));
const oldSize = new T.Box3().setFromObject(oldModel).getSize(new T.Vector3());
const newSize = new T.Box3().setFromObject(newModel).getSize(new T.Vector3());
for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(newSize[axis] / oldSize[axis] - 3) < 1e-8);
for (const type of Object.keys(ENEMY_TYPES)) {
  state.snap = { ...state.snap, wave: state.snap.wave + 1, roster: [testEnemy(type)] };
  vm.runInContext('enemies(10000)', state);
  const model = models.get(0);
  assert.equal(model.userData.enemyType, type);
  assert.equal(model.parent, scene);
  assert.ok(model.visible && model.scale.x > 0);
  if (ENEMY_TYPES[type].ground)
    assert.ok(
      new T.Box3().setFromObject(model).min.y >= 0,
      'Ground enemy geometry above the floor',
    );
}
console.log(
  'Four ants from wave one, exact threefold midge dimensions, all six actual client models and terrestrial geometry above the floor.',
);
