import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL, ReplyAssembler } from '../src/udp-protocol.js';
let now = 123000, id = 0, chunks = [];
const game = new Game({ now: () => now });
const session = new GameSession(game, {
  now: () => now,
  send: (packet) => chunks.push(packet),
  relay() {},
  close() {},
});
function command(path, body = {}) {
  chunks = [];
  session.command(JSON.stringify({ v: PROTOCOL, id: ++id, path, body }));
  const assembler = new ReplyAssembler();
  let reply;
  for (const packet of chunks) reply = assembler.receive(JSON.parse(packet)) || reply;
  assert.equal(reply?.status, 200, 'command succeeds: ' + path);
  return reply.body;
}
const joined = command('join', { code: 'ROSTER-BATCH', name: 'Test' });
const state = joined.snapshot.pilots.find((p) => p.id === joined.id).state;
const sync = () => command('sync', { state, mode: 'foot' });
const first = sync();
assert.ok(first.roster?.length > 0, 'first sync sends canonical roster');
const second = sync();
assert.ok(!Object.hasOwn(second, 'roster'), 'same roster omitted from subsequent sync');
assert.equal(second.total, first.total);
const room = game.rooms.get('ROSTER-BATCH');
command('balance', {
  epoch: room.base.epoch,
  revision: room.balanceRevision,
  values: { damage: 2 },
});
const modified = sync();
assert.ok(modified.roster?.length > 0, 'balance revision forces a fresh roster');
assert.ok(!Object.hasOwn(sync(), 'roster'));
game.startWave(room);
const newWave = sync();
assert.ok(newWave.roster?.length > 0, 'a different wave forces a fresh roster');
assert.notEqual(newWave.wave, first.wave);
assert.ok(!Object.hasOwn(sync(), 'roster'));
console.log('PASS: first sync, omitted unchanged rosters, balance revisions and wave transitions.');
