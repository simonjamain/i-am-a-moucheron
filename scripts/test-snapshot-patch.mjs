import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL, ReplyAssembler } from '../src/udp-protocol.js';
import { applyPatch, diffValue } from '../src/snapshot-wire.js';

const json = (v) => JSON.parse(JSON.stringify(v));

// 1. Property test: for random JSON-like values and random edits, applying the
// patch to the receiver's (parsed JSON) copy restores exactly JSON(next).
let seed = 42;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (list) => list[Math.floor(random() * list.length)];
function value(depth = 0) {
  const kind = depth > 3 ? pick(['n', 's', 'b', 'z']) : pick(['n', 's', 'b', 'z', 'o', 'a', 'u']);
  if (kind === 'n') return pick([0, 1, -2.5, 1e9, NaN, Infinity]);
  if (kind === 's') return pick(['', 'a', 'midge', 'é']);
  if (kind === 'b') return random() < 0.5;
  if (kind === 'z') return null;
  if (kind === 'u') return undefined;
  if (kind === 'a') return Array.from({ length: Math.floor(random() * 4) }, () => value(depth + 1));
  const o = {};
  for (let i = 0; i < Math.floor(random() * 4); i++)
    o[pick(['x', 'y', 'id', 'state'])] = value(depth + 1);
  return o;
}
function edit(v, depth = 0) {
  if (random() < 0.25 || v === null || typeof v !== 'object')
    return random() < 0.5 ? v : value(depth);
  if (Array.isArray(v)) {
    const out = v.map((item) => (random() < 0.4 ? edit(item, depth + 1) : item));
    if (random() < 0.3) out.push(value(depth + 1));
    if (random() < 0.3) out.splice(0, 1);
    return out;
  }
  const out = {};
  for (const [k, item] of Object.entries(v))
    if (random() > 0.15) out[k] = random() < 0.4 ? edit(item, depth + 1) : item;
  if (random() < 0.3) out[pick(['x', 'y', 'id', 'extra'])] = value(depth + 1);
  return out;
}
for (let i = 0; i < 5000; i++) {
  const prev = { root: value() },
    next = { root: edit(prev.root) };
  const patch = diffValue(prev, next);
  const received = patch ? applyPatch(json(prev), json(patch)) : json(prev);
  assert.deepEqual(received, json(next), 'patch parity, case ' + i);
}
assert.throws(() => applyPatch({}, { a: { 0: { $: 1 } }, n: 1 }), /invalide/);
assert.throws(() => applyPatch([], { a: { 5: { $: 1 } }, n: 2 }), /invalide/);
assert.throws(() => applyPatch({}, 'bad'), /invalide/);
assert.throws(() => applyPatch({}, JSON.parse('{"o":{"__proto__":{"$":1}}}')), /invalide/);

// 2. A real session: every decoded reply equals the full snapshot the room
// would produce at that moment (minus the roster, kept from the first reply).
let now = 500000;
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
function call(path, body = {}) {
  sent.length = 0;
  session.command(JSON.stringify({ v: PROTOCOL, id: ++id, path, body }));
  let reply;
  for (const packet of sent) reply = assembler.receive(JSON.parse(packet)) || reply;
  assert.ok(reply, 'reply for ' + path);
  return { reply, wire: sent.map((p) => JSON.parse(p).data).join('') };
}
const joined = call('join', { code: 'PATCHED', name: 'Alpha' }).reply.body;
const other = game.join({ code: 'PATCHED', name: 'Bravo' });
const room = game.rooms.get('PATCHED');
const me = room.pilots.get(joined.id);
let patched = 0;
function check(label, mutate) {
  mutate?.();
  now += 137;
  const { reply, wire } = call('sync', { state: me.state, mode: 'foot' });
  assert.equal(reply.status, 200, label);
  if (wire.includes('$patch')) patched++;
  // The server's baseline for this connection is exactly what it meant to send.
  const server = session.lastWireSnapshot;
  const { roster, rosterAdd, kills, enemyDamage, ...decoded } = reply.body;
  assert.deepEqual(decoded, json(server.fields), 'decoded fields equal server fields: ' + label);
  assert.deepEqual(new Set(kills), server.kills, 'kills: ' + label);
  assert.deepEqual(enemyDamage, server.damage, 'damage: ' + label);
}
check('first sync');
check('nothing changed');
check(
  'other pilot moves',
  () => (room.pilots.get(other.id).state = { ...room.pilots.get(other.id).state, p: [1, 2, 3] }),
);
check('other pilot leaves the list', () => {
  room.pilots.get(other.id).seen = now - 20000;
});
check('a new pilot arrives', () => game.join({ code: 'PATCHED', name: 'Charlie' }));
check('mission starts', () => game.command('PATCHED', joined.id, 'start', {}));
check('wave begins', () => {
  room.next_wave_at = now - 1;
});
check('kills and damage', () => {
  room.kills.add(0);
  room.enemyDamage[1] = 2;
});
check('money and effects', () => {
  room.dollars += 7;
  room.effects.push({ id: 999, kind: 'clean', vehicle: 'x' });
});
check('field becomes undefined', () => {
  me.state = { ...me.state, aimPoint: undefined };
});
assert.ok(patched >= 8, 'steady replies travel as patches');
console.log(
  'Snapshot patches: 5000 random cases and a real session restore full snapshots exactly.',
);
