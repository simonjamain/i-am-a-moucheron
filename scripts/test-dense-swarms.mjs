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
// Debug flocks must scale spatially and emerge from several real portals.
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
const flocks = Map.groupBy(large, (e) => e.routeSeed);
assert.equal(small.length, 10);
assert.equal(large.length, 1000, 'debug counts stay exact');
assert.ok(flocks.size >= 12, 'a thousand midges must form several flocks');
assert.ok([...flocks.values()].every((members) => members.length <= 64));
assert.equal(new Set([...flocks.values()].map((members) => enemyRoute(members[0]).portal)).size, 4);
assert.ok(
  [...flocks.values()].every((members) =>
    members.every(
      (e) =>
        e.portalIndex === members[0].portalIndex &&
        e.swarmSize === members.length &&
        e.duration === members[0].duration,
    ),
  ),
);
assert.ok(large.every((e) => e.spawn >= 0 && e.spawn < 4));
assert.deepEqual(large, debugSwarmRoster({ midge: 1000 }, debugParams));
const smallOffset = midgeDisplacement({ ...small[0], id: 37, swarmSize: 10 }, 20);
const largeOffset = midgeDisplacement({ ...small[0], id: 37, swarmSize: 50 }, 20);
assert.ok(
  Math.hypot(largeOffset[0], largeOffset[2]) > 2 * Math.hypot(smallOffset[0], smallOffset[2]),
  'flock radius grows with its population',
);
const groundFlocks = debugSwarmRoster({ ant: 120 }, debugParams);
assert.equal(new Set(groundFlocks.map((e) => enemyRoute(e).portal)).size, 3);
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
  "if (roster[j].type === 'midge') continue; const b = samples[j];",
);
const reference = new Function(
  'MAP',
  'INSECT_SCALE',
  'enemySizeFactor',
  'GROUND_FOOT_DEPTH',
  'enemyRoutePosition',
  'midgeDisplacement',
  exhaustive + '; return exhaustiveFrame;',
)(MAP, INSECT_SCALE, enemySizeFactor, GROUND_FOOT_DEPTH, enemyRoutePosition, midgeDisplacement);
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
