import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MAP, INSECT_SCALE, enemySizeFactor, GROUND_FOOT_DEPTH } from '../src/scale.js';
import { enemyRoute, enemyRoutePosition } from '../src/routes.js';
import { scaleRoster, DEFAULT_BALANCE } from '../src/balance.js';
import {
  wavePlan,
  expandMidgeSwarms,
  swarmFrame,
  midgeDisplacement,
  swarmSpread,
  debugSwarmRoster,
  MAX_WAVE_POPULATION,
} from '../src/waves.js';
import { Game } from '../server/game.js';
import { encodeReply, ReplyAssembler } from '../src/udp-protocol.js';
const input = [
  { id: 0, type: 'ant', spawn: 0, phase: 0.1, hp: 100 },
  { id: 1, type: 'midge', spawn: 1, phase: 0.2, hp: 100, routeSeed: 13 },
  { id: 2, type: 'brute', spawn: 2, phase: 0.3, hp: 800 },
];
const expanded = expandMidgeSwarms(input);
assert.equal(expanded.length, 7);
assert.deepEqual(
  expanded.filter((e) => e.type !== 'midge').map(({ sourceId, id, ...e }) => e),
  input.filter((e) => e.type !== 'midge').map(({ id, ...e }) => e),
);
for (const e of expanded.filter((e) => e.type === 'midge')) {
  assert.equal(e.hp, 100);
  assert.equal(e.routeSeed, 13);
  assert.ok(e.spawn >= 1 && e.spawn <= 1.28);
}
for (const wave of [1, 2, 6, 12, 30, 100, 1000])
  for (let seed = 0; seed < 5; seed++) {
    const p = wavePlan('DENSE' + seed, wave, 123);
    assert.ok(p.roster.length <= MAX_WAVE_POPULATION);
    assert.deepEqual(
      p.roster.map((e) => e.id),
      p.roster.map((e, i) => i),
    );
    const groups = Map.groupBy(p.roster, (e) => e.sourceId);
    for (const members of groups.values()) {
      const e = members[0];
      assert.equal(members.length, e.type === 'midge' ? 5 : 1);
      assert.ok(
        members.every(
          (m) => m.routeSeed === e.routeSeed && m.duration === e.duration && m.hp === e.hp,
        ),
      );
    }
    assert.equal(
      [...groups.values()].reduce((n, group) => n + group[0].cost, 0),
      p.budget,
    );
  }
const first = wavePlan('DENSE', 1, 123);
assert.ok(first.roster.filter((e) => e.type === 'ant').length >= 2);
assert.ok(first.roster.every((e) => ['ant', 'midge'].includes(e.type)));
// Manual requests always make ONE flock of the full requested population.
const debugParams = {
  room: 'DEBUG-FLOCKS',
  wave: 1,
  started: 0,
  now: 0,
  balance: DEFAULT_BALANCE,
  firstId: 0,
  revision: 1,
};
const small = debugSwarmRoster({ midge: 10 }, debugParams);
const large = debugSwarmRoster({ midge: 1000 }, debugParams);
const maximum = debugSwarmRoster({ midge: 5000 }, debugParams);
assert.equal(small.length, 10);
assert.equal(large.length, 1000);
assert.equal(maximum.length, 5000);
for (const flock of [small, large, maximum]) {
  assert.equal(new Set(flock.map((e) => e.routeSeed)).size, 1, 'one manual route per command');
  assert.equal(new Set(flock.map((e) => enemyRoute(e).portal)).size, 1, 'one entrance');
  assert.ok(flock.every((e) => e.swarmSize === flock.length && e.debugFlock));
  assert.ok(flock.every((e) => e.spawn >= 0 && e.spawn < 3));
  assert.equal(new Set(flock.map((e) => e.travelSpeed)).size, 1, 'stable individual route speed');
}
assert.equal(small[0].routeSeed, large[0].routeSeed, 'population never selects another route');
assert.equal(small[0].travelSpeed, large[0].travelSpeed, 'population never changes route speed');
assert.deepEqual(large, debugSwarmRoster({ midge: 1000 }, debugParams));
assert.ok(swarmSpread(large[0]) > 6 * swarmSpread(small[0]));
const smallOffset = midgeDisplacement({ ...small[0], id: 37 }, 20);
const largeOffset = midgeDisplacement({ ...large[0], id: 37 }, 20);
assert.ok(
  Math.hypot(largeOffset[0], largeOffset[2]) > 5 * Math.hypot(smallOffset[0], smallOffset[2]),
  'larger flocks must occupy more space',
);
const localSpeed = (e, t, dt = 0.05) => {
  const before = midgeDisplacement(e, t);
  const after = midgeDisplacement(e, t + dt);
  return Math.hypot(...after.map((v, i) => v - before[i])) / dt;
};
assert.ok(
  Math.abs(localSpeed({ ...small[0], id: 37 }, 20) - localSpeed({ ...large[0], id: 37 }, 20)) <
    1e-12,
  'local insect flight speed cannot increase with population',
);
const frameSpeed = (flock, t, dt = 0.05) => {
  const before = swarmFrame([flock[0]], t)[0].p;
  const after = swarmFrame([flock[0]], t + dt)[0].p;
  return Math.hypot(...after.map((v, i) => v - before[i])) / dt;
};
const midflight = Math.min(small[0].entryHold + 20, small[0].duration - 20);
assert.ok(
  Math.abs(frameSpeed(small, midflight) - frameSpeed(large, midflight)) < 1e-10,
  'same insect on the same route must travel at the same speed in a large flock',
);
for (const count of [10, 1000]) {
  const testFlock = debugSwarmRoster({ midge: count }, debugParams);
  assert.ok(
    swarmFrame([testFlock[0]], testFlock[0].entryHold + 0.15)[0].p.every(Number.isFinite),
    'safe finite positions during entrance fade',
  );
}
const ground = debugSwarmRoster({ ant: 120, roach: 240 }, debugParams);
assert.equal(new Set(ground.map((e) => e.routeSeed)).size, 1, 'one ground route');
assert.equal(new Set(ground.map((e) => enemyRoute(e).portal)).size, 1);
assert.ok(ground.every((e) => e.swarmSize === ground.length));
const mixed = debugSwarmRoster({ midge: 1000, dart: 200, ant: 40 }, debugParams);
assert.equal(new Set(mixed.filter((e) => !e.ground).map((e) => e.routeSeed)).size, 1);
assert.equal(new Set(mixed.filter((e) => e.ground).map((e) => e.routeSeed)).size, 1);
assert.ok(mixed.filter((e) => !e.ground).every((e) => e.swarmSize === 1200));
assert.ok(mixed.filter((e) => e.ground).every((e) => e.swarmSize === 40));
const brutes = debugSwarmRoster({ brute: 1000 }, debugParams);
const bruteFrame = swarmFrame(brutes, brutes[0].entryHold + 15);
assert.equal(bruteFrame.filter(Boolean).length, 1000, 'other flying species support a large flock');
const natural = wavePlan('DENSE-SCALE', 50, 123);
const multiplied = scaleRoster(natural, { ...DEFAULT_BALANCE, population: 3 }).roster;
const midgeFlocks = Map.groupBy(
  multiplied.filter((e) => e.type === 'midge'),
  (e) => [e.routeSeed || 1, e.branch || 0, e.portalIndex ?? -1].join(':'),
);
assert.ok(midgeFlocks.size > 0);
for (const members of midgeFlocks.values())
  assert.ok(members.every((e) => e.swarmSize === members.length));
// Compare the exact spatial algorithm with the previous exhaustive neighbour
// loop, on sparse and dense frames. No visual approximation or skipped peers.
const source = readFileSync('src/waves.js', 'utf8');
let exhaustive = source
  .slice(source.indexOf('export function swarmFrame'))
  .replace('export function swarmFrame', 'function exhaustiveFrame');
exhaustive = exhaustive.replace(
  'for (const j of candidates)',
  'for (let j = 0; j < samples.length; j++)',
);
// The optimized grid intentionally excludes procedurally independent midges;
// the exhaustive reference must use the same candidate species.
exhaustive = exhaustive.replace(
  'const b = samples[j];',
  "if (roster[j].type === 'midge' || roster[j].debugFlock) continue; const b = samples[j];",
);
const reference = new Function(
  'MAP',
  'INSECT_SCALE',
  'enemySizeFactor',
  'GROUND_FOOT_DEPTH',
  'enemyRoutePosition',
  'midgeDisplacement',
  'swarmSpread',
  exhaustive + '; return exhaustiveFrame;',
)(
  MAP,
  INSECT_SCALE,
  enemySizeFactor,
  GROUND_FOOT_DEPTH,
  enemyRoutePosition,
  midgeDisplacement,
  swarmSpread,
);
const roster = wavePlan('DENSE-BENCH', 100, 123).roster;
for (const time of [1, 4, 20, 75, 125]) {
  const result = swarmFrame(roster, time),
    expected = reference(roster, time);
  assert.equal(JSON.stringify(result), JSON.stringify(expected));
}
// Eliminating a midge from the input must never shift another member of the flock.
const midges = roster.filter((e) => e.type === 'midge').slice(0, 120);
const withAll = swarmFrame(midges, 75);
for (const removed of [0, 5, 20, midges.length - 1]) {
  const without = midges.filter((_, i) => i !== removed);
  const positions = new Map(without.map((e, i) => [e.id, swarmFrame(without, 75)[i]]));
  for (let i = 0; i < midges.length; i++) {
    if (i === removed) continue;
    assert.deepEqual(
      positions.get(midges[i].id),
      withAll[i],
      'neighbour removed: fixed ID and time',
    );
  }
}
// Realistic stress input: distinct stable IDs and hit points, one source route.
const exemplar = midges[0];
for (const size of [1000, 5000, 10000]) {
  const mass = Array.from({ length: size }, (_, id) => ({
    ...exemplar,
    id,
    sourceId: exemplar.sourceId,
    spawn: 0,
    entryHold: 0,
    duration: 150,
    phase: exemplar.phase + id * 0.01,
  }));
  const begin = performance.now();
  const positions = swarmFrame(mass, 75);
  assert.equal(positions.filter(Boolean).length, size);
  assert.notDeepEqual(positions[0].p, positions[1].p);
  assert.deepEqual(
    swarmFrame(mass.slice(1), 75)[0],
    positions[1],
    'first ID removal is independent',
  );
  console.log(
    JSON.stringify({
      proceduralMidges: size,
      cpuMs: +(performance.now() - begin).toFixed(2),
      note: 'CPU only',
    }),
  );
}
const run = (fn) => {
  const start = performance.now();
  for (let n = 0; n < 10; n++) fn(roster, 75 + n * 0.01);
  return (performance.now() - start) / 10;
};
run(swarmFrame);
run(reference);
console.log(
  JSON.stringify({
    population: roster.length,
    spatialMs: run(swarmFrame),
    exhaustiveMs: run(reference),
    note: 'CPU only, not WebGL FPS or WAN load',
  }),
);
// Every duplicate remains independently damageable, counted for wave completion
// and delivered in snapshots, with IDs beyond the former 180 ceiling supported.
let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'DENSENET', name: 'A' });
const r = game.rooms.get('DENSENET');
game.command(r.code, a.id, 'start');
now += 10000;
let snapshot = game.command(r.code, a.id, 'sync', { mode: 'foot', state: a.state });
const firstTotal = wavePlan(r.code, 1, r.started).roster.length;
assert.equal(snapshot.total, firstTotal);
for (let enemy = 0; enemy < firstTotal - 1; enemy++)
  game.command(r.code, a.id, 'hit', { wave: 1, enemy, amount: 800, shot: 'kill' + enemy });
snapshot = game.snapshot(r);
assert.equal(snapshot.phase, 'combat');
assert.equal(snapshot.kills.length, firstTotal - 1);
game.command(r.code, a.id, 'hit', { wave: 1, enemy: firstTotal - 1, amount: 800, shot: 'last' });
snapshot = game.snapshot(r);
assert.equal(snapshot.phase, 'prep');
assert.equal(snapshot.dollars, 4);
assert.equal(snapshot.souls.length, Math.min(firstTotal, 24));
r.wave = 99;
game.startWave(r); // Build the room-local plan through the same transition as a real wave.
snapshot = game.snapshot(r);
assert.ok(snapshot.total > 180);
const high = snapshot.total - 1;
game.command(r.code, a.id, 'hit', { wave: 100, enemy: high, amount: 800, shot: 'high-id' });
assert.ok(r.kills.has(high));
const chunks = encodeReply(game.snapshot(r), 1),
  assembler = new ReplyAssembler();
let received;
for (const packet of chunks) received = assembler.receive(JSON.parse(packet)) || received;
assert.ok(received);
console.log(
  'Dense swarms: exactly five midges per source, other species preserved, deterministic spatial grid, all IDs damageable, completion/rewards and snapshot chunking passed.',
);
