import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL, ReplyAssembler } from '../src/udp-protocol.js';

// Regression: firing a machine gun from a vehicle sent a reply that is not a
// room snapshot (aircraft-fire), encoded as a snapshot patch since v248. The
// browser's decoder then threw on the next reply and closed the connection:
// a disconnection/reconnection loop while firing, stable again on foot.
let now = 900000;
const game = new Game({ now: () => now });
const sent = [];
const session = new GameSession(game, {
  now: () => now,
  send: (p) => sent.push(p),
  relay() {},
  close() {},
});
const assembler = new ReplyAssembler();
let id = 0;
const call = (path, body = {}) => {
  sent.length = 0;
  session.command(JSON.stringify({ v: PROTOCOL, id: ++id, path, body }));
  let reply;
  // The browser decodes every reply in order; any exception closes the link.
  for (const packet of sent) reply = assembler.receive(JSON.parse(packet)) || reply;
  assert.ok(reply, 'reply to ' + path);
  return reply;
};
const joined = call('join', { code: 'FIRE', name: 'Gunner' }).body;
const room = game.rooms.get('FIRE');
const pilot = room.pilots.get(joined.id);
const plane = [...room.vehicles.values()].find((v) => v.type === 'fighter');
game.assign(room, pilot, plane, 'pilot', null);
const state = () => ({ ...plane.state, vehicle: plane.id, seat: 'pilot' });
now += 100;
assert.equal(call('sync', { state: state(), mode: 'flight' }).status, 200);
for (let burst = 0; burst < 5; burst++) {
  now += 100;
  const fired = call('aircraft-fire', {
    shots: ['b' + burst + 'a', 'b' + burst + 'b'],
    vehicle: plane.id,
    seat: 'pilot',
  });
  assert.equal(fired.status, 200);
  assert.equal(fired.body.allowed, true, 'the fire report keeps its own fields');
  assert.deepEqual(fired.body.shots, ['b' + burst + 'a', 'b' + burst + 'b']);
  now += 100;
  const synced = call('sync', { state: state(), mode: 'flight' });
  assert.equal(synced.status, 200, 'the next sync still decodes');
  assert.equal(synced.body.code, 'FIRE', 'and is a complete room snapshot');
  assert.ok(synced.body.pilots.some((p) => p.id === joined.id));
}
console.log('Fire replies in a vehicle: decoded alongside snapshot patches, no broken link.');
