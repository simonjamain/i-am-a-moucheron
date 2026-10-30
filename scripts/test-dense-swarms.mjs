import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MAP, INSECT_SCALE, enemySizeFactor, GROUND_FOOT_DEPTH } from '../src/scale.js';
import { enemyRoutePosition } from '../src/routes.js';
import { wavePlan, expandMidgeSwarms, swarmFrame, MAX_WAVE_POPULATION } from '../src/waves.js';
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
assert.equal(first.roster.filter((e) => e.type === 'midge').length, 20);
assert.equal(first.roster.filter((e) => e.type === 'ant').length, 4);
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
const reference = new Function(
  'MAP',
  'INSECT_SCALE',
  'enemySizeFactor',
  'GROUND_FOOT_DEPTH',
  'enemyRoutePosition',
  exhaustive + '; return exhaustiveFrame;',
)(MAP, INSECT_SCALE, enemySizeFactor, GROUND_FOOT_DEPTH, enemyRoutePosition);
const roster = wavePlan('DENSE-BENCH', 100, 123).roster;
for (const time of [1, 4, 20, 75, 125]) {
  const result = swarmFrame(roster, time),
    expected = reference(roster, time);
  assert.equal(JSON.stringify(result), JSON.stringify(expected));
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
assert.equal(snapshot.total, 24);
for (let enemy = 0; enemy < 23; enemy++)
  game.command(r.code, a.id, 'hit', { wave: 1, enemy, amount: 800, shot: 'kill' + enemy });
snapshot = game.snapshot(r);
assert.equal(snapshot.phase, 'combat');
assert.equal(snapshot.kills.length, 23);
game.command(r.code, a.id, 'hit', { wave: 1, enemy: 23, amount: 800, shot: 'last' });
snapshot = game.snapshot(r);
assert.equal(snapshot.phase, 'prep');
assert.equal(snapshot.dollars, 4);
assert.equal(snapshot.souls.length, 24);
r.wave = 100;
r.phase = 'combat';
r.started = now;
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
