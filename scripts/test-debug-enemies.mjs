// Debug mode: enemies placed from the shop (P). Dummies stand still, never die,
// take every hit and keep the wave open until removed; live enemies keep their
// HP and speed and head for the bin (walkers on the floor, flyers through the
// nearest corridor). Server rules, roster entries and routes
// (src/debug-enemies.ts, server/game.js labCommand, src/routes.ts).
import { modelTriangles } from '../src/office-collision.ts';
import { MODEL_DATA } from '../src/office-pack-data.ts';
import { OFFICE_LAYOUT } from '../src/layout.ts';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import {
  DEBUG_ENEMY_TYPES,
  DUMMY_HP,
  debugEnemy,
  debugPlacement,
  standingHeight,
} from '../src/debug-enemies.ts';
import { ENEMY_TYPES, swarmFrame } from '../src/waves.ts';
import { DEFAULT_BALANCE } from '../src/balance.js';
import { enemyRoute, PORTALS } from '../src/routes.ts';
import { fireGroundSentries, SENTRY } from '../src/ground-sentry.ts';
import { GROUND_BOUNDS } from '../src/ground-defense.ts';

// 1. Every species, both kinds; inputs validated.
assert.deepEqual(
  [...DEBUG_ENEMY_TYPES].sort(),
  Object.keys(ENEMY_TYPES).sort(),
  'one card per species',
);
for (const bad of [
  { kind: 'ghost', type: 'ant', p: [0, 0, 0] },
  { kind: 'dummy', type: 'dart', p: [0, 0, 0] },
  { kind: 'dummy', type: 'ant', p: [0, 0] },
  { kind: 'dummy', type: 'ant', p: [9, 0, 0] },
  { kind: 'live', type: 'ant', p: [0, -1, 0] },
  { kind: 'live', type: 'ant', p: [0, 0, 0], dir: [NaN, 1] },
])
  assert.throws(() => debugPlacement(bad), /invalide|pièce/, JSON.stringify(bad));
assert.deepEqual(
  debugPlacement({ kind: 'dummy', type: 'ant', p: [1, 0, 1], dir: [3, 4] }).dir,
  [0.6, 0.8],
);
// A floor hit rounds a hair below y = 0 (placement-aim.ts): still on the floor.
assert.deepEqual(
  debugPlacement({ kind: 'live', type: 'rat', p: [1, -1e-9, 1] }).p,
  [1, 0, 1],
  'floor hit just under 0 accepted',
);
assert.deepEqual(
  debugPlacement({ kind: 'dummy', type: 'ant', p: [4.15, 0, -3.55] }).p,
  [GROUND_BOUNDS[2], 0, GROUND_BOUNDS[1]],
  'wall-side hit clamped into the room',
);

// 2. Room rules: debug only, during a wave.
let now = 1_000_000;
const game = new Game({ now: () => now });
const { id } = game.join({ code: 'DUMMY', name: 'Testeur' });
const r = game.rooms.get('DUMMY');
const lab = (action, extra = {}) =>
  game.command('DUMMY', id, 'lab', { epoch: r.base.epoch, action, ...extra });
const place = (kind, type, p, dir = [0, 1]) => lab('place', { kind, type, p, dir });
assert.throws(() => place('dummy', 'ant', [0, 0, 0]), /debug/);
lab('enable');
assert.throws(() => place('dummy', 'ant', [0, 0, 0]), /vague/);
game.command('DUMMY', id, 'start', {});
r.next_wave_at = now - 1;
game.advance(r);
assert.equal(r.phase, 'combat');
const roster = () => game.plan(r).roster;
const before = roster().length;
const revision = r.rosterRevision;
place('dummy', 'ant', [0.5, 0, 0.5], [1, 0]);
assert.equal(roster().length, before + 1);
assert.ok(r.rosterRevision > revision, 'clients receive the addition');
const antIndex = before;
const ant = roster()[antIndex];
assert.equal(ant.debug, 'dummy');
assert.equal(ant.hp, DUMMY_HP);
assert.ok(Math.abs(ant.dummy.p[1] - standingHeight('ant', ant.size, 0)) < 1e-12, 'on the floor');
place('dummy', 'guard', [0.5, 0.4, 0.6]);
const beeIndex = before + 1;
assert.deepEqual(roster()[beeIndex].dummy.p, [0.5, 0.4, 0.6], 'flyer hovers at the aimed point');
place('dummy', 'roach', [-1.8, 0.9, 1.6]);
assert.ok(roster()[before + 2].dummy.p[1] > 0.9, 'a dummy may stand on furniture');

// 3. Dummies stay put, are not walked by the crowd and never die.
now += 5000;
game.advance(r);
const frame = swarmFrame(roster(), (now - r.started) / 1000, r.groundAgents);
assert.deepEqual(frame[antIndex].p, ant.dummy.p);
assert.deepEqual(frame[beeIndex].p, [0.5, 0.4, 0.6]);
assert.equal(r.groundAgents[ant.id], undefined, 'no crowd agent for a dummy');
// A sentry shoots the dummy in range; damage accumulates, no kill.
const sentry = {
  kind: 'sentry',
  id: 's1',
  position: [0.5, 0.45],
  hp: SENTRY.hp,
  ammo: 5,
  angle: 0,
};
const targets = frame.map((f, index) =>
  index === antIndex ? { id: index, p: f.p, dead: false } : null,
);
fireGroundSentries([sentry], targets, now, (target, _s, damage) => {
  r.enemyDamage[target.id] = (r.enemyDamage[target.id] || 0) + damage;
});
assert.equal(r.enemyDamage[antIndex], SENTRY.damage, 'sentries target dummies');
// Player hits (from a gun station): a strong shot leaves the dummy standing.
r.pilots.get(id).mode = 'turret';
const shot = (n) =>
  game.hit(r, r.pilots.get(id), { wave: r.wave, enemy: antIndex, amount: 800, shot: 'p' + n });
for (let i = 0; i < 50; i++) shot(i);
assert.ok(r.enemyDamage[antIndex] > SENTRY.damage + 1000, 'player hits are counted');
assert.ok(!r.kills.has(antIndex), 'a dummy never dies');

// 4. The wave stays open while a dummy stands: kill every regular enemy.
for (let i = 0; i < roster().length; i++) if (!roster()[i].dummy) game.defeatEnemy(r, i);
// Spider broods appended by the kills above: defeat them as well.
for (let i = 0; i < roster().length; i++) if (!roster()[i].dummy) game.defeatEnemy(r, i);
game.advance(r);
assert.equal(r.phase, 'combat', 'standing dummies keep the wave open');
lab('clear-dummies');
assert.ok(r.kills.has(antIndex) && r.kills.has(beeIndex), 'dummies removed');
const enemySouls = [...r.souls.values()].filter((s) => s.kind === 'enemy').length;
now += 100;
game.advance(r);
assert.equal(r.phase, 'prep', 'the wave ends once the dummies are gone');
assert.equal(
  [...r.souls.values()].filter((s) => s.kind === 'enemy').length,
  enemySouls,
  'removing dummies sends no soul to the purgatory',
);

// 5. Live enemies: walker from the floor below the aim, flyer via a corridor.
const balance = DEFAULT_BALANCE;
const walker = debugEnemy(
  { kind: 'live', type: 'roach', p: [-1.8, 0.9, 1.6], dir: [0, 1] },
  { id: 0, time: 3, balance, seq: 1 },
);
assert.equal(walker.hp, ENEMY_TYPES.roach.hp * balance.enemyHP);
assert.deepEqual(walker.spawnPoint, [-1.8, 0.0007, 1.6], 'walkers start on the floor');
const route = enemyRoute(walker);
const { bin } = OFFICE_LAYOUT;
assert.deepEqual(route.points.at(-1), [bin.x, bin.y + 0.38, bin.z], 'walker reaches the bin');
const start = [-3, 1, 1];
const flyer = debugEnemy(
  { kind: 'live', type: 'mosquito', p: start, dir: [0, 1] },
  { id: 1, time: 3, balance, seq: 2 },
);
const air = enemyRoute(flyer);
assert.deepEqual(air.points[0], start, 'flyer departs from the aimed point');
assert.deepEqual(air.points.at(-1), [bin.x, bin.y + 0.38, bin.z], 'flyer reaches the bin');
// Its course joins the nearest point of a usual vent corridor, then follows it.
const usual = PORTALS.air.map((_, portal) => enemyRoute({ portalIndex: portal, routeSeed: 1 }));
const nearest = Math.min(
  ...usual.flatMap((u) => u.samples.map((s) => Math.hypot(...s.p.map((v, j) => v - start[j])))),
);
const joined = air.samples.find((s) => {
  const p = s.p;
  return usual.some((u) =>
    u.samples.some((q) => Math.hypot(...q.p.map((v, j) => v - p[j])) < 1e-9),
  );
});
assert.ok(joined, 'the course meets a usual corridor');
assert.ok(
  Math.abs(Math.hypot(...joined.p.map((v, j) => v - start[j])) - nearest) < 1e-6,
  'at its nearest point',
);
const tail = usual[air.portal].points;
assert.deepEqual(air.points.slice(-3), tail.slice(-3), 'then the usual end of the course');
// A placed midge is its own swarm of one.
const midges = [1, 2].map((seq) =>
  debugEnemy(
    { kind: 'live', type: 'midge', p: start, dir: [0, 1] },
    { id: seq, time: 0, balance, seq },
  ),
);
assert.notEqual(midges[0].routeSeed, midges[1].routeSeed);
console.log(
  'PASS: debug dummies (still, invulnerable, shot by sentries, keep the wave open, removable) and live enemies (walkers on the floor, flyers through the nearest corridor).',
);

// 6. Client tools (debug-tools.ts): shop columns, dummy damage readout,
// hit-volume wireframes matching insect-hits.js, turret and sugar ranges.
const T = await import('../vendor/three.webgpu.min.js');
const { DebugTools, DamageMeter, DAMAGE_WINDOW_S, formatDamage, MESH_COLLIDER_COLOR } =
  await import('../src/debug-tools.ts');
const { nearestInsectHit } = await import('../src/insect-hits.ts');
const { WalkerBatch } = await import('../src/walker-batch.ts');
const { SENTRY: SENTRY_RULES } = await import('../src/ground-sentry.ts');
const meter = new DamageMeter();
assert.equal(meter.update(0, 0), false);
meter.update(38, 1);
meter.update(38, 1.1); // same total from the server: no new hit
meter.update(150, 2);
assert.equal(meter.last, 112, 'last hit');
assert.equal(meter.total, 150, 'total of the last 3 s');
meter.update(150, 1 + DAMAGE_WINDOW_S + 0.01);
assert.equal(meter.total, 112, 'older hits leave the window');
assert.equal(formatDamage(12345.4), '12 345');
const element = () => ({
  className: '',
  dataset: {},
  children: [],
  classList: { add() {}, remove() {} },
  append(...c) {
    this.children.push(...c);
  },
  getContext: () => null,
});
const fakeDocument = { createElement: element, body: element() };
const commands = [];
const scene = new T.Scene();
const camera = new T.PerspectiveCamera();
camera.position.set(0, 0.95, 0);
camera.lookAt(0, 0.9, -0.1);
camera.updateMatrixWorld();
let closed = 0;
const tools = new DebugTools({
  T,
  scene,
  document: fakeDocument,
  camera,
  command: async (body) => (commands.push(body), true),
  notify() {},
  aimSurface: () => new T.Vector3(0, 0.9, -0.1),
  closeShop: () => closed++,
  names: Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, e]) => [k, e.name])),
  grounded: Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, e]) => [k, !!e.ground])),
  symbols: {},
  sentryRange: SENTRY_RULES.range,
});
const [dummies, lives] = tools.shopSections();
assert.equal(dummies.dataset.debug, 'dummy');
assert.equal(lives.dataset.debug, 'live');
assert.equal(dummies.children.filter((c) => c.dataset.enemy).length, DEBUG_ENEMY_TYPES.length);
assert.ok(dummies.children.some((c) => /Retirer les mannequins/.test(c.textContent)));
dummies.children.find((c) => c.dataset.enemy === 'rat').onclick();
assert.equal(closed, 1, 'choosing a card closes the shop');
await tools.press();
assert.deepEqual(commands.at(-1).p, [0, 0.9, -0.1], 'walker on the aimed surface');
assert.equal(commands.at(-1).kind, 'dummy');
lives.children.find((c) => c.dataset.enemy === 'guard').onclick();
await tools.press();
const hover = commands.at(-1).p;
assert.ok(
  hover[1] > 0.9 && Math.hypot(hover[0], hover[1] - 0.95, hover[2]) < 0.1 + 1e-9,
  'flyer in the air',
);
tools.cancel();
await tools.press();
assert.equal(commands.length, 2, 'no placement once cancelled');
// Hit volume wireframe = the ellipsoid the shots test (point on its surface).
const walkers = new WalkerBatch(T, scene, { shadows: false });
const model = walkers.create('ant', 0.3);
model.position.set(0.3, 0.1, -0.2);
model.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), 0.7);
model.scale.setScalar(0.02);
tools.showHitboxes([model], true);
assert.equal(tools.hitboxes.count, 1);
const m = new T.Matrix4();
tools.hitboxes.getMatrixAt(0, m);
const surface = new T.Vector3(0, 1, 0).applyMatrix4(m);
const above = surface.clone().add(new T.Vector3(0, 0.05, 0));
const down = new T.Vector3(0, -1, 0);
const hit = nearestInsectHit(T, above, down, new Map([[1, model]]), 1);
assert.ok(hit && Math.abs(hit.point.y - surface.y) < 1e-6, 'wireframe top = hit surface');
tools.showHitboxes([model], false);
assert.equal(tools.hitboxes.count, 0, 'hidden outside debug mode');
// Treadmill: a dummy walks in place, facing its placer.
const phase = model.userData.walkPhase;
walkers.treadmill(model, [1, 0, 0], 0.08, 0.1);
assert.notEqual(model.userData.walkPhase, phase, 'legs move');
const facing = new T.Vector3(0, 0, -1).applyQuaternion(model.quaternion);
assert.ok(facing.distanceTo(new T.Vector3(1, 0, 0)) < 1e-6, 'faces dir');
// Ranges: sentry sphere + circle, sugar circle; nothing outside debug mode.
tools.showRanges(
  [
    { kind: 'sentry', id: '1', position: [1, 2], y: 0.9 },
    { kind: 'sugar', id: '2', position: [0, 0], radius: 0.15 },
    { kind: 'barricade', id: '3' },
  ],
  true,
);
const kinds = tools.ranges.children.map((c) => c.geometry.type);
assert.deepEqual(kinds.sort(), ['RingGeometry', 'RingGeometry', 'SphereGeometry']);
const bubble = tools.ranges.children.find((c) => c.geometry.type === 'SphereGeometry');
assert.equal(bubble.geometry.parameters.radius, SENTRY_RULES.range);
assert.deepEqual(bubble.position.toArray(), [1, 0.925, 2], 'centre used by the turret');
tools.showRanges([{ kind: 'sentry', id: '1', position: [1, 2] }], false);
assert.equal(tools.ranges.children.length, 0);
// Collision volumes: every box drawn as faces + 12 edges, rebuilt on change only.
const boxes = [
  new T.Box3(new T.Vector3(-1, 0, -1), new T.Vector3(1, 0.74, 1)),
  new T.Box3(new T.Vector3(2, 0, 2), new T.Vector3(2.5, 1.8, 2.4)),
];
tools.showColliders(boxes, true);
const [faces, edges] = tools.colliders.children;
assert.equal(faces.count, 2);
assert.ok(faces.material.transparent && faces.material.opacity < 0.3, 'faint faces');
assert.equal(edges.geometry.attributes.position.count, 2 * 24, '12 edges per box');
const fm = new T.Matrix4();
faces.getMatrixAt(1, fm);
assert.deepEqual(
  new T.Box3(new T.Vector3(-0.5, -0.5, -0.5), new T.Vector3(0.5, 0.5, 0.5))
    .applyMatrix4(fm)
    .min.toArray()
    .map((v) => +v.toFixed(6)),
  [2, 0, 2],
  'face box = collider',
);
tools.showColliders(boxes, true);
assert.equal(tools.colliders.children[0], faces, 'unchanged colliders: no rebuild');
boxes.push(new T.Box3(new T.Vector3(0, 0, 0), new T.Vector3(0.1, 0.1, 0.1)));
tools.showColliders(boxes, true);
assert.equal(tools.colliders.children[0].count, 3, 'new collider shown');
// Triangle colliders of the props: one batch of edges, three per triangle.
const mug = [modelTriangles(MODEL_DATA, 'Mug')];
tools.showColliders(boxes, true, mug);
const wire = tools.colliders.children.find(
  (c) => c.material.color.getHex() === MESH_COLLIDER_COLOR,
);
assert.equal(wire.geometry.attributes.position.count, (mug[0].length / 9) * 6);
tools.showColliders(boxes, false, mug);
assert.equal(tools.colliders.children.length, 0, 'hidden outside debug mode');
console.log(
  'PASS: debug shop columns, placement, damage readout, hit volumes, treadmill, ranges and collision volumes.',
);
