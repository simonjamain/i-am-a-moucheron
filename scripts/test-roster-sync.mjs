import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL, ReplyAssembler } from '../src/udp-protocol.js';
import { debugSwarmRoster } from '../src/waves.js';

let now = 123000,
  id = 0,
  chunks = [];
const game = new Game({ now: () => now });
const session = new GameSession(game, {
  now: () => now,
  send: (packet) => chunks.push(packet),
  relay() {},
  close() {},
});
const assembler = new ReplyAssembler();
function command(path, body = {}) {
  chunks = [];
  session.command(JSON.stringify({ v: PROTOCOL, id: ++id, path, body }));
  let reply;
  for (const packet of chunks) reply = assembler.receive(JSON.parse(packet)) || reply;
  assert.equal(reply?.status, 200, 'command succeeds: ' + path);
  return reply.body;
}
const joined = command('join', { code: 'ROSTERBCH', name: 'Test' });
assert.ok(joined.snapshot.roster?.length > 0, 'join sends canonical roster');
const state = joined.snapshot.pilots.find((p) => p.id === joined.id).state;
const sync = () => command('sync', { state, mode: 'foot' });
const first = sync();
assert.ok(!Object.hasOwn(first, 'roster'), 'join established roster baseline');
assert.deepEqual(first.kills, joined.snapshot.kills);
const second = sync();
assert.ok(!Object.hasOwn(second, 'roster'), 'same roster omitted from all syncs');
assert.equal(second.total, first.total);
const room = game.rooms.get('ROSTERBCH');
game.startWave(room);
const newWave = sync();
assert.ok(newWave.roster?.length > 0, 'a different wave forces a fresh roster');
assert.notEqual(newWave.wave, first.wave);
assert.ok(!Object.hasOwn(sync(), 'roster'));
// Mid-wave roster growth (as brood offspring do): only appended insects are sent.
room.plan.roster.push(
  ...debugSwarmRoster(
    { midge: 12, ant: 1 },
    {
      room: room.code,
      wave: room.wave,
      started: room.started,
      now: room.started,
      balance: room.balance,
      firstId: room.plan.roster.length,
      revision: room.rosterRevision + 1,
    },
  ),
);
room.rosterRevision++;
const added = sync();
assert.equal(added.rosterRevision, 1);
assert.equal(added.roster.length, newWave.roster.length + 13);
assert.ok(session.replies.get(id).includes('rosterAddGroups'), 'spawn sends only appended insects');
assert.ok(!Object.hasOwn(sync(), 'roster'), 'unchanged debug roster omitted');
command('pistol-trace', {
  shot: 'roster-test',
  incarnation: room.pilots.get(joined.id).incarnation,
  origin: [0, 0, 0],
  direction: [0, 0, -1],
});
const hit = command('hit', { wave: room.wave, enemy: 0, amount: 30, shot: 'roster-test' });
assert.ok(!Object.hasOwn(hit, 'roster'), 'hit must not resend thousands of insects');
assert.equal(hit.enemyDamage[0], 30, 'damage uses the fixed default multiplier');
assert.equal(sync().enemyDamage[0], 30, 'unchanged damage reconstructed from prior response');
assert.ok(
  session.replies.get(id).includes('enemyDamageChanged'),
  'wire transmits changes instead of full damage map',
);
console.log('PASS: join, shared roster, delta damage, wave and appended-roster revisions.');
