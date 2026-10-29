import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { advanceArena, bodyMotion } from '../src/purgatory-physics.js';
import { localDB } from './local-db.mjs';
const DB = localDB();
const signature = Array.from({ length: 12 }, (_, i) => [
  0.1 + i * 0.05,
  0.4 + Math.sin(i) * 0.1,
  i ? 1 : 0,
]);
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { DB },
  );
  const body = await r.json();
  // Legacy rule tests start the mission immediately; countdown behaviour has
  // dedicated fake-clock coverage in test-fleet-scale.mjs.
  if (path === 'start' && body.wave === 0 && body.mission_started) {
    const p = await DB.prepare('SELECT room FROM pilots WHERE id=?').bind(data.id).first();
    await DB.prepare('UPDATE rooms SET next_wave_at=? WHERE code=?')
      .bind(Date.now() - 1, p.room)
      .run();
    return api('sync', {
      id: data.id,
      state: JSON.parse(
        (await DB.prepare('SELECT state FROM pilots WHERE id=?').bind(data.id).first()).state,
      ),
    });
  }
  return { status: r.status, body };
}
async function embark(p) {
  const pilot = await DB.prepare('SELECT room,bay FROM pilots WHERE id=?').bind(p.id).first();
  let snap = (await api('sync', { id: p.id, state: p.state })).body;
  const arena = snap.base,
    body = arena.bodies.find((b) => b.entity === p.id);
  const col = pilot.bay % 10,
    x = -29 + col * 6.4,
    z = 4 + Math.floor(pilot.bay / 10) * 3.6;
  body.x = x + (col === 9 ? -3.15 : 3.15);
  body.z = z;
  body.vx = body.vz = 0;
  arena.time = Date.now();
  await DB.prepare('UPDATE rooms SET base_state=?,base_revision=base_revision+1 WHERE code=?')
    .bind(JSON.stringify(arena), pilot.room)
    .run();
  for (const form of [1, 2]) {
    const response = await api('board-sign', { id: p.id, form, signature });
    assert.equal(response.status, 200);
    snap = response.body;
  }
  p.state = snap.pilots.find((x) => x.id === p.id).state;
}
const a = (await api('join', { code: 'TEST123', name: 'Alpha' })).body;
const b = (await api('join', { code: 'TEST123', name: 'Bravo' })).body;
assert.equal(a.snapshot.pilots.find((p) => p.id === a.id).mode, 'foot');
await embark(a);
await embark(b);
assert.notEqual(a.id, b.id);
assert.notDeepEqual(a.state.p, b.state.p);
assert.equal(b.snapshot.pilots.length, 2);
const c = (await api('join', { code: 'OTHER', name: 'Charlie' })).body;
assert.equal(c.snapshot.pilots.length, 1);
await Promise.all([api('start', { id: a.id }), api('start', { id: b.id })]);
const sync = await api('sync', { id: a.id, state: a.state });
assert.equal(sync.body.wave, 1);
assert.equal(sync.body.phase, 'combat');
await api('hit', { id: a.id, wave: 1, enemy: 0, amount: 75 });
const hit = await api('hit', { id: b.id, wave: 1, enemy: 0, amount: 75 });
assert.deepEqual(hit.body.kills, [0]);
await api('fan', { id: b.id });
const fan = await api('sync', { id: a.id, state: a.state });
assert.equal(fan.body.fan, 0);
assert.equal(fan.body.pilots.length, 2);
assert.equal((await api('sync', { id: 'fake', state: a.state })).status, 401);
assert.equal((await api('join', { code: 'bad <script>' })).status, 400);
assert.equal((await api('sync', { id: a.id, state: { ...a.state, p: [null, 0, 0] } })).status, 400);
assert.equal((await api('start', { id: c.id })).body.wave, 1);
console.log(
  'PASS: unique aircraft, shared room, isolated rooms, atomic wave start, deduplicated kills, shared fan, invalid sessions and input.',
);

// Physical purgatory: positions and attacks belong to the persisted server arena.
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const d = (await api('join', { code: 'SOULS', name: 'Dante' })).body;
const e = (await api('join', { code: 'SOULS', name: 'Eve' })).body;
await embark(d);
await embark(e);
await api('start', { id: d.id });
await api('hit', { id: d.id, wave: 1, enemy: 0, amount: 75 });
await api('hit', { id: e.id, wave: 1, enemy: 0, amount: 75 });
await api('death', { id: d.id });
await api('death', { id: d.id });
await api('death', { id: e.id });
let snapshot = (await api('sync', { id: d.id, state: d.state })).body;
assert.equal(snapshot.souls.length, 3);
assert.equal(snapshot.arena.bodies.length, 3);
await api('hit', { id: d.id, wave: 1, enemy: 1 });
assert.deepEqual((await api('sync', { id: e.id, state: e.state })).body.kills, [0]);
async function arrange(change) {
  const room = await DB.prepare('SELECT purgatory FROM rooms WHERE code=?').bind('SOULS').first();
  const arena = JSON.parse(room.purgatory);
  arena.time = now;
  for (const b of arena.bodies) {
    b.x = 6;
    b.z = 12 + b.id * 2;
    b.vx = 0;
    b.vz = 0;
    b.input = { x: 0, z: 0, guard: false };
    b.inputAt = now;
    b.koUntil = 0;
    b.nextAttack = 0;
    b.balance = 100;
    b.attack = null;
  }
  change(arena);
  await DB.prepare('UPDATE rooms SET purgatory=?,purg_revision=purg_revision+1 WHERE code=?')
    .bind(JSON.stringify(arena), 'SOULS')
    .run();
}
// The server validates signatures against the last client-reported body, not arbitrary form fields.
await arrange((a) => {
  const b = a.bodies.find((b) => b.entity === e.id);
  b.x = 0;
  b.z = 1;
});
assert.equal(
  (await api('sign', { id: d.id, form: 1, signature, body: { x: 0, z: 1, vx: 0, vz: 0, face: 0 } }))
    .status,
  409,
);
assert.equal((await api('sign', { id: e.id, form: 1, signature: [] })).status, 400);
await arrange((a) => {
  const b = a.bodies.find((b) => b.entity === e.id);
  b.x = 0;
  b.z = 1;
});
const stamped = await api('sign', { id: e.id, form: 1, signature });
assert.equal(stamped.status, 200);
assert.ok(
  stamped.body.arena.events.some((e) => e.kind === 'stamp'),
  'stamp is replicated for nearby players',
);
await arrange((a) => {
  const b = a.bodies.find((b) => b.entity === e.id);
  b.x = 3;
  b.z = 3;
});
assert.equal(
  (await api('sign', { id: e.id, form: 2, signature })).status,
  409,
  'leaving the desk interrupts the next document',
);
await arrange((a) => {
  const b = a.bodies.find((b) => b.entity === e.id);
  b.x = 0;
  b.z = 1;
});
assert.equal((await api('sign', { id: e.id, form: 3, signature })).status, 409);
for (const form of [2, 3])
  assert.equal((await api('sign', { id: e.id, form, signature })).status, 200);
snapshot = (await api('sync', { id: e.id, state: e.state })).body;
assert.equal(snapshot.pilots.find((p) => p.id === e.id).life, 'alive');
assert.equal(snapshot.pilots.find((p) => p.id === e.id).mode, 'foot');
assert.equal(
  snapshot.souls.some((s) => s.entity === e.id),
  false,
);
Date.now = realNow;
console.log('PASS: purgatory desk ownership, ordered signatures and full return.');
