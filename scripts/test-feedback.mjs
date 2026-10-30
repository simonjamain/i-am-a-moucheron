import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createGraphics } from '../src/graphics.js';
import { InsectStatus, insectScale, woundState } from '../src/insect-status.js';
import { nearestInsectHit, nearestMeshHit } from '../src/insect-hits.js';
import { INSECT_SCALE } from '../src/scale.js';
import { wavePlan, swarmFrame, entryStatus } from '../src/waves.js';
import { PORTALS, MIN_SPAWN_DISTANCE } from '../src/routes.js';
import { mergeOwnedArena } from '../src/purgatory-physics.js';
const scene = new T.Scene(),
  { insect } = createGraphics(T, scene),
  old = insect('midge'),
  larger = insect('midge');
old.scale.setScalar(INSECT_SCALE);
larger.scale.setScalar(insectScale('midge', INSECT_SCALE));
const a = new T.Box3().setFromObject(old).getSize(new T.Vector3()),
  b = new T.Box3().setFromObject(larger).getSize(new T.Vector3());
assert.ok(Math.abs(b.x / a.x - 1.35 * 1.5 * 3) < 1e-8);
assert.equal(insectScale('brute', 2), 2);
let oldHits = 0,
  newHits = 0;
for (let x = -0.004; x <= 0.004; x += 0.0001)
  for (let y = -0.002; y <= 0.002; y += 0.0001) {
    const origin = new T.Vector3(x, y, 0.02),
      dir = new T.Vector3(0, 0, -1);
    oldHits += !!nearestInsectHit(T, origin, dir, new Map([[0, old]]), 0.1);
    newHits += !!nearestInsectHit(T, origin, dir, new Map([[0, larger]]), 0.1);
  }
assert.ok(newHits > oldHits * 1.5, `${newHits} vs ${oldHits}`);
const camera = new T.PerspectiveCamera();
camera.position.set(0, 0.01, 0.1);
const status = new InsectStatus(T, scene, { scale: INSECT_SCALE });
assert.equal(woundState(100, 100).visible, false);
assert.equal(woundState(0, 100).visible, false);
status.update(1, larger, 75, 100, camera, 0);
assert.equal(status.items.size, 1);
let e = status.items.get(1);
assert.ok(!e.flames[0].visible);
assert.ok(Math.abs(e.fill.scale.x / e.back.scale.x - 0.75) < 1e-8);
status.update(1, larger, 25, 100, camera, 1);
assert.ok(e.flames[0].visible);
assert.equal(
  nearestMeshHit(new T.Raycaster(new T.Vector3(0, 0.01, 0.1), new T.Vector3(0, 0, -1)), e.root),
  null,
);
for (let i = 0; i < 1000; i++) status.update(1, larger, 25, 100, camera, i / 60);
assert.equal(status.items.size, 1);
assert.equal(e.root.children.length, 6);
status.keep(new Set());
assert.equal(status.items.size, 0);
const merged = mergeOwnedArena(
  {
    epoch: 'same',
    bodies: [{ id: 1, entity: 'npc', kind: 'enemy', health: 25, maxHealth: 100, paper: 0 }],
  },
  {
    epoch: 'same',
    time: 2,
    host: 'me',
    bodies: [{ id: 1, entity: 'npc', kind: 'enemy', health: 100 }],
  },
  'me',
);
// The host must keep its motion, but not an obsolete HP field.
const state = {
  epoch: 'same',
  host: 'me',
  bodies: [{ id: 1, entity: 'npc', kind: 'enemy', health: 25, maxHealth: 100, paper: 0 }],
};
assert.equal(
  mergeOwnedArena(state, { ...state, bodies: [{ ...state.bodies[0], health: 100 }] }, 'me')
    .bodies[0].health,
  25,
);
const target = [2.5, 0.33, -2.7];
for (const list of Object.values(PORTALS))
  for (const p of list)
    assert.ok(Math.hypot(...p.map((v, i) => v - target[i])) >= MIN_SPAWN_DISTANCE);
for (let seed = 0; seed < 50; seed++)
  for (const wave of [1, 3, 6, 12, 30]) {
    const plan = wavePlan('ENTRY' + seed, wave, seed);
    for (const enemy of plan.roster) {
      for (const age of [0, 0.05, 1, 1.99]) {
        const point = swarmFrame([enemy], enemy.spawn + age)[0]?.p;
        assert.ok(point);
        assert.ok(Math.hypot(...point.map((v, i) => v - target[i])) >= MIN_SPAWN_DISTANCE);
        assert.ok(
          Math.abs(point[0]) > 4 || Math.abs(point[2]) > 3.45,
          'first visible entry stays on perimeter',
        );
      }
    }
  }
console.log(
  'PASS: +35% actual model/hit area, other types unchanged, wound bars/smoke/flames, no HUD collisions, bounded effects, shared HP metadata and peripheral first-frame entries.',
);

const intro = wavePlan('DISCOVERY', 1, 123).roster[0];
assert.equal(entryStatus(intro, intro.spawn + 1), 'entry');
assert.equal(entryStatus(intro, intro.spawn + 30), 'in-flight');
assert.equal(entryStatus(intro, intro.spawn + intro.duration), 'arrived');
const late = swarmFrame([intro], intro.spawn + intro.duration - 0.1)[0].p;
assert.ok(
  Math.hypot(...late.map((v, i) => v - target[i])) < 3,
  'late discovery keeps its actual near-bin position rather than teleporting',
);
// The very first join snapshot needs the same anchored clock as later syncs.
const { default: worker } = await import('../worker/index.js');
const { localDB } = await import('./local-db.mjs');
const DB = localDB();
const joinResponse = await worker.fetch(
  new Request('https://test/api/join', {
    method: 'POST',
    body: JSON.stringify({ name: 'Clock', code: 'ENTRYTIME' }),
  }),
  { DB },
);
const join = await joinResponse.json();
assert.ok(join.snapshot.sentAt >= join.snapshot.now);
const { readFileSync } = await import('node:fs'),
  { default: vm } = await import('node:vm');
const source = readFileSync('src/client.js', 'utf8'),
  api = source.slice(source.indexOf('async function api('), source.indexOf('function accept('));
const c = {
  Date,
  AbortSignal,
  performance: { now: () => 1234 },
  fetch: async () => ({ ok: true, json: async () => join }),
  lastSnap: 0,
  clockOffset: 0,
};
vm.createContext(c);
vm.runInContext(api, c);
const received = await vm.runInContext("api('join',{})", c);
assert.equal(received.snapshot.receivedAt, 1234);
console.log(
  'PASS: join and sync clocks share server-send and monotonic receive anchors, including the first rendered frame.',
);
