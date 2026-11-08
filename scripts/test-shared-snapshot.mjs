import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL, ReplyAssembler } from '../src/udp-protocol.js';
import { MOTION_REFRESH_MS } from '../src/snapshot-wire.js';

// 1. Shared room snapshots: sync replies reuse one snapshot for at most
// snapshotShareMs; other commands and roster changes rebuild it at once.
let now = 700000;
const game = new Game({ now: () => now, snapshotShareMs: 50 });
const a = game.join({ code: 'SHARED', name: 'Alpha' }),
  b = game.join({ code: 'SHARED', name: 'Bravo' });
const r = game.rooms.get('SHARED');
const sync = (id) =>
  game.command('SHARED', id, 'sync', { state: r.pilots.get(id).state, mode: 'foot' });
const first = sync(a.id);
r.dollars += 5; // direct domain change, invisible until the window ends
now += 20;
const second = sync(b.id);
assert.equal(second.dollars, first.dollars, 'sync inside the window reuses the snapshot');
assert.equal(second.now, now, 'the reply time stays exact');
assert.equal(second.sentAt, now);
assert.deepEqual(second.damage, [], 'per-player damage is added to a copy');
assert.ok(second.pilots === first.pilots, 'the room part is shared, not cloned again');
now += 30;
assert.equal(sync(a.id).dollars, first.dollars + 5, 'the window expires after 50 ms');
r.dollars += 1;
now += 5;
game.command('SHARED', a.id, 'start', {});
now += 5;
assert.equal(sync(b.id).mission_started, r.mission_started, 'other commands rebuild at once');
assert.equal(sync(b.id).dollars, r.dollars);
const before = sync(a.id);
r.next_wave_at = now - 1;
now += 5;
const wave = sync(b.id);
assert.equal(wave.wave, r.wave, 'a new wave (roster key) never reuses the old room');
assert.notEqual(wave.wave, before.wave);
assert.ok(wave.roster?.length, 'and the matching roster is sent');
const exact = new Game({ now: () => now });
const c = exact.join({ code: 'EXACT', name: 'Alpha' });
const exactSync = () =>
  exact.command('EXACT', c.id, 'sync', {
    state: exact.rooms.get('EXACT').pilots.get(c.id).state,
    mode: 'foot',
  });
exactSync();
exact.rooms.get('EXACT').dollars += 3;
assert.equal(exactSync().dollars, 3, 'sharing is off by default');

// 2. Other players' positions in reliable replies refresh at 1 Hz; gameplay
// fields, the player's own data and discontinuities are sent at once.
now = 900000;
const g = new Game({ now: () => now });
const sent = [];
const session = new GameSession(g, {
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
  for (const packet of sent) reply = assembler.receive(JSON.parse(packet)) || reply;
  assert.equal(reply?.status, 200, path);
  return reply.body;
};
const me = call('join', { code: 'HOLD', name: 'Me' });
const other = g.join({ code: 'HOLD', name: 'Other' });
const room = g.rooms.get('HOLD');
const mine = room.pilots.get(me.id),
  theirs = room.pilots.get(other.id);
const view = (s) => s.pilots.find((p) => p.id === other.id);
now += 1000;
const base = call('sync', { state: mine.state, mode: 'foot' });
const startP = view(base).state.p;
now += 200;
theirs.state = { ...theirs.state, p: [9, 9, 9], hp: 40 };
theirs.seen = now;
mine.state = { ...mine.state, hp: 77 };
const held = call('sync', { state: { ...mine.state, hp: 77 }, mode: 'foot' });
assert.deepEqual(view(held).state.p, startP, 'another player position is held under 1 s');
assert.equal(view(held).seen, view(base).seen, 'its timestamp is held with it');
assert.equal(view(held).state.hp, 40, 'gameplay fields are never held');
assert.equal(held.pilots.find((p) => p.id === me.id).state.hp, 77, 'own data is never held');
const body = (s) => s.base.bodies.find((x) => x.entity === other.id);
const bodyBefore = body(held).x;
room.base.bodies.find((x) => x.entity === other.id).x += 3;
now += 200;
assert.equal(
  body(call('sync', { state: mine.state, mode: 'foot' })).x,
  bodyBefore,
  'on-foot bodies are held too',
);
now += MOTION_REFRESH_MS;
const refreshed = call('sync', { state: mine.state, mode: 'foot' });
assert.deepEqual(view(refreshed).state.p, [9, 9, 9], 'positions refresh after 1 s');
assert.equal(body(refreshed).x, bodyBefore + 3);
now += 100;
theirs.incarnation++;
theirs.state = { ...theirs.state, p: [1, 1, 1] };
assert.deepEqual(
  view(call('sync', { state: mine.state, mode: 'foot' })).state.p,
  [1, 1, 1],
  'a new life is sent at once',
);
console.log(
  'Shared snapshots (50 ms, rebuilt on commands and new rosters) and 1 Hz remote positions OK',
);
