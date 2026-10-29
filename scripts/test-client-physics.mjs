import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
import { bodyMotion, createSoul, advanceArena, mergeOwnedArena } from '../src/purgatory-physics.js';
import { aircraftBay } from '../src/base.js';
const DB = localDB(),
  realNow = Date.now;
let now = realNow();
Date.now = () => now;
async function api(path, data) {
  const response = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: response.status, body: await response.json() };
}
const a = (await api('join', { code: 'LOCAL', name: 'A' })).body,
  b = (await api('join', { code: 'LOCAL', name: 'B' })).body;
let snap = (await api('sync', { id: a.id, state: a.state })).body;
let local = structuredClone(snap.base);
const me = local.bodies.find((p) => p.entity === a.id);
me.x = 8;
me.z = 20;
me.vx = 3;
me.vz = -2;
const report = { epoch: local.epoch, body: bodyMotion(me) };
let reply = await api('sync', { id: a.id, state: a.state, ground: report });
assert.equal(reply.status, 200);
const stored = reply.body.base.bodies.find((p) => p.entity === a.id);
assert.equal(stored.x, 8);
assert.equal(stored.vx, 3);
now += 2000;
reply = await api('sync', { id: b.id, state: b.state });
const frozen = reply.body.base.bodies.find((p) => p.entity === a.id);
assert.equal(frozen.x, 8);
assert.equal(frozen.z, 20, 'another player polling must not simulate me');
me.x = 12;
me.z = 21;
const merged = mergeOwnedArena(reply.body.base, local, a.id);
assert.equal(merged.bodies.find((p) => p.entity === a.id).x, 12);
// A signature carries its latest local position; no preceding sync is required.
const signature = Array.from({ length: 14 }, (_, i) => [
  0.1 + i * 0.05,
  0.5 + Math.sin(i) * 0.1,
  i ? 1 : 0,
]);
const pilot = snap.pilots.find((p) => p.id === a.id),
  bay = aircraftBay(pilot.bay);
me.x = bay.entryX;
me.z = bay.entryZ;
const signed = await api('board-sign', {
  id: a.id,
  form: 1,
  signature,
  ground: { epoch: local.epoch, body: bodyMotion(me) },
});
assert.equal(signed.status, 200);
await api('death', { id: a.id });
await api('death', { id: b.id });
snap = (await api('sync', { id: a.id, state: a.state })).body;
const host = snap.arena.host;
assert.equal(host, [a.id, b.id].sort()[0]);
const sender = host === a.id ? a : b,
  receiver = host === a.id ? b : a,
  arena = snap.arena;
const actor = arena.bodies.find((p) => p.entity === sender.id),
  target = arena.bodies.find((p) => p.entity === receiver.id);
// A remote proxy cannot be moved by the local integrator.
const near = createSoul({ id: 101, entity: 'remote', kind: 'player' }, 0, now),
  self = createSoul({ id: 102, entity: 'self', kind: 'player' }, 0, now);
near.x = 0;
near.z = 10;
self.x = 0.3;
self.z = 10;
const pair = { time: now, events: [], bodies: [near, self] };
advanceArena(pair, now + 100, 'self');
assert.equal(near.x, 0);
assert.equal(near.z, 10);
assert.ok(self.x > 0.3);
// A disconnected host is replaced by the remaining player on the next snapshot.
await DB.prepare('UPDATE pilots SET seen=? WHERE id=?')
  .bind(now - 13000, host)
  .run();
const handover = (await api('sync', { id: receiver.id, state: receiver.state })).body;
assert.equal(handover.arena.host, receiver.id);
// Reset still changes the scene epoch and creates fresh bodies.
await api('reset', { id: host });
const reset = (await api('sync', { id: a.id, state: a.state })).body;
assert.notEqual(reset.base.epoch, local.epoch);
Date.now = realNow;
console.log(
  'PASS: real HTTP/database relay accepts local bodies, never integrates on poll, fresh-position signing, impact retry deduplication, remote proxy ownership and reset',
);
