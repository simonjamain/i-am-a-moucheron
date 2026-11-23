import assert from 'node:assert/strict';
import { advanceGroundCrowd, crowdSeparation, groundRadius } from '../src/ground-crowd.js';
import { buildGroundFlow } from '../src/ground-defense.ts';
import { swarmFrame } from '../src/waves.js';

const makeUnit = (id, p) => ({
  id,
  p: [...p],
  dir: [1, 0],
  tasted: [],
  stickyInside: [],
  arrived: false,
});
const enemy = (id, type = 'ant') => ({
  id,
  type,
  size: 0.8,
  ground: true,
  spawn: 0,
  duration: 100,
  travelSpeed: 0.085,
});
const flow = buildGroundFlow({ bounds: [-1, -1, 4, 1], cellSize: 0.05, goal: [3, 0] });
const world = { structures: [], goalFlow: flow, baitFlow: () => null, damageWall: () => {} };
// Two overlapping bodies must separate physically, not just in the rendered pose.
const roster = [enemy(1), enemy(2)];
const initial = { 1: makeUnit(1, [0, -0.001]), 2: makeUnit(2, [0, 0.001]) };
const agents = structuredClone(initial);
for (let i = 0; i < 100; i++)
  advanceGroundCrowd(agents, roster, new Set(), i * 0.05, (i + 1) * 0.05, world);
const distance = Math.hypot(...agents[1].p.map((v, i) => v - agents[2].p[i]));
assert.ok(distance > groundRadius(roster[0]) * 1.5, 'soft bodies separate');
for (const unit of Object.values(agents)) assert.ok(unit.p[0] > 0.3, 'crowd keeps moving');
const frames = swarmFrame(roster, 5, agents);
for (let i = 0; i < roster.length; i++) {
  assert.deepEqual(
    [frames[i].p[0], frames[i].p[2]],
    agents[roster[i].id].p,
    'render/hits use actual positions, no lanes',
  );
}
// Independent paths, symmetric updates, and equivalent delayed server ticks.
const reverse = structuredClone(initial),
  catchup = structuredClone(initial);
advanceGroundCrowd(reverse, [...roster].reverse(), new Set(), 0, 5, world);
advanceGroundCrowd(catchup, roster, new Set(), 0, 5, world);
for (const id of [1, 2])
  for (let axis = 0; axis < 2; axis++) {
    assert.ok(
      Math.abs(reverse[id].p[axis] - agents[id].p[axis]) < 1e-9,
      'update order independent',
    );
    assert.ok(
      Math.abs(catchup[id].p[axis] - agents[id].p[axis]) < 1e-9,
      'delayed tick equivalence',
    );
  }
const coincident = roster.map((e) => ({ enemy: e, unit: makeUnit(e.id, [0, 0]) }));
const force = crowdSeparation(coincident);
const a = force(coincident[0].unit, roster[0]),
  b = force(coincident[1].unit, roster[1]);
assert.ok(Math.hypot(...a) > 0.9, 'coincident spawn has an escape direction');
assert.ok(Math.hypot(a[0] + b[0], a[1] + b[1]) < 1e-9, 'opposite pair forces');
// Dead/arrived agents cannot hold up a survivor.
const alone = { 1: makeUnit(1, [0, 0]), 2: makeUnit(2, [0.001, 0]) };
advanceGroundCrowd(alone, roster, new Set([1]), 0, 1, world);
assert.ok(Math.abs(alone[1].p[0] - 0.085) < 1e-9);
assert.deepEqual(alone[2].p, [0.001, 0]);
// Stationary creatures remain still even when neighbours overlap them.
for (const state of [{ stuckUntil: 2 }, { eatingUntil: 2, baitId: 'meal' }]) {
  const resting = { 1: { ...makeUnit(1, [0, 0]), ...state }, 2: makeUnit(2, [0, 0.001]) };
  advanceGroundCrowd(resting, roster, new Set(), 0, 1, world);
  assert.deepEqual(resting[1].p, [0, 0]);
}
// A dense mixed crowd must not escape a narrow obstacle corridor.
const corridor = buildGroundFlow({
  bounds: [-1, -1, 4, 1],
  cellSize: 0.05,
  goal: [3, 0],
  staticObstacles: [
    { min: { x: -0.5, z: 0.1 }, max: { x: 2.5, z: 1 } },
    { min: { x: -0.5, z: -1 }, max: { x: 2.5, z: -0.1 } },
  ],
});
const denseRoster = Array.from({ length: 24 }, (_, id) => enemy(id, id % 5 ? 'ant' : 'roach'));
const dense = Object.fromEntries(
  denseRoster.map((e) => [
    e.id,
    makeUnit(e.id, [(e.id % 8) * 0.025, (Math.floor(e.id / 8) - 1) * 0.01]),
  ]),
);
for (let i = 0; i < 200; i++) {
  const before = structuredClone(dense);
  advanceGroundCrowd(dense, denseRoster, new Set(), i * 0.05, (i + 1) * 0.05, {
    ...world,
    goalFlow: corridor,
  });
  for (const e of denseRoster) {
    assert.ok(corridor.clear(before[e.id].p, dense[e.id].p), 'no wall crossing under pressure');
    assert.ok(
      Math.hypot(...dense[e.id].p.map((v, k) => v - before[e.id].p[k])) <= 0.085 * 0.05 + 1e-9,
      'speed bounded',
    );
  }
}
assert.ok(
  Object.values(dense).every((u) => u.p[0] > 0.15),
  'no crowd deadlock',
);
console.log(
  'PASS: physical soft separation, authoritative poses, order/tick stability, deaths, rests, dense mixed corridor.',
);

// Real office paths: all three portals, then a navigation revision mid-wave.
const { groundFlow, newGroundDefense, groundCommand } =
  await import('../src/ground-defense-state.ts');
const { prepareRoster } = await import('../server/wave-preparation.js');
const { DEFAULT_BALANCE } = await import('../src/balance.js');
let seed = 42;
const draw = (n) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((seed / 4294967296) * n);
};
const actualRoster = prepareRoster(5, DEFAULT_BALANCE, draw)
  .roster.filter((e) => e.type === 'ant')
  .slice(0, 48)
  .map((e, i) => ({ ...e, portalIndex: i % 3, spawn: i * 0.1 }));
const office = newGroundDefense(),
  actual = {};
let officeWorld = { ...world, structures: office.structures, goalFlow: groundFlow(office) };
let maxTick = 0,
  total = 0;
for (let i = 0; i < 800; i++) {
  if (i === 80) {
    groundCommand(
      office,
      { action: 'build', kind: 'barricade', a: [0, 0], b: [0.3, 0] },
      [0, 0],
      100,
    );
    officeWorld = { ...officeWorld, structures: office.structures, goalFlow: groundFlow(office) };
  }
  const start = performance.now();
  advanceGroundCrowd(actual, actualRoster, new Set(), i * 0.25, (i + 1) * 0.25, officeWorld);
  const ms = performance.now() - start;
  maxTick = Math.max(maxTick, ms);
  total += ms;
}
assert.equal(
  Object.values(actual).filter((u) => u.arrived).length,
  actualRoster.length,
  'all portals reach the bin after rebuilding navigation',
);
console.log(
  `Office crowd: ${actualRoster.length} ants arrive; mean ${(total / 800).toFixed(2)} ms / 250 ms tick, max ${maxTick.toFixed(2)} ms (local CPU, not WebGL/WAN).`,
);
