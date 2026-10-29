import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { OFFICE_LAYOUT } from '../src/layout.js';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
import {
  aircraftBay,
  baseBody,
  baseAccess,
  advanceBase,
  reconcileBase,
  baseWorld,
} from '../src/base.js';
const DB = localDB();
const signature = Array.from({ length: 14 }, (_, i) => [
  0.1 + i * 0.05,
  0.5 + Math.sin(i) * 0.1,
  i ? 1 : 0,
]);
async function api(path, data) {
  const r = await worker.fetch(
    new Request('https://test.local/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
}
const [a, b] = await Promise.all([
  api('join', { code: 'BOARD', name: 'Alpha' }),
  api('join', { code: 'BOARD', name: 'Bravo' }),
]);
assert.equal(a.status, 200);
assert.equal(b.status, 200);
const self = a.body.snapshot.pilots.find((p) => p.id === a.body.id);
const peer = b.body.snapshot.pilots.find((p) => p.id === b.body.id);
assert.notEqual(self.bay, peer.bay, 'simultaneous joins reserve different planes');
assert.equal(self.mode, 'foot');
assert.equal(
  a.body.snapshot.base.bodies.some((p) => p.entity === a.body.id),
  true,
);
assert.equal(
  (await api('board-sign', { id: a.body.id, form: 1, signature })).status,
  409,
  'cannot sign from spawn outside the boarding circle',
);
const hacked = await api('sync', {
  id: a.body.id,
  state: { ...a.body.state, p: [60, 40, -60], fire: true },
});
const actual = hacked.body.pilots.find((p) => p.id === a.body.id);
assert.notDeepEqual(actual.state.p, [60, 40, -60]);
assert.equal(actual.state.fire, false);
await api('start', { id: a.body.id });
await api('hit', { id: a.body.id, wave: 1, enemy: 0 });
assert.equal(
  (await api('sync', { id: a.body.id, state: a.body.state })).body.kills.length,
  0,
  'on-foot players cannot fire aircraft guns',
);
async function position(x, z) {
  const row = await DB.prepare("SELECT base_state FROM rooms WHERE code='BOARD'").first(),
    arena = JSON.parse(row.base_state),
    body = arena.bodies.find((p) => p.entity === a.body.id);
  Object.assign(body, { x, z, vx: 0, vz: 0 });
  arena.time = Date.now();
  await DB.prepare("UPDATE rooms SET base_state=?,base_revision=base_revision+1 WHERE code='BOARD'")
    .bind(JSON.stringify(arena))
    .run();
}
const bay = aircraftBay(self.bay);
await position(bay.entryX, bay.entryZ);
assert.equal((await api('board-sign', { id: a.body.id, form: 1, signature: [] })).status, 400);
assert.equal((await api('board-sign', { id: a.body.id, form: 2, signature })).status, 409);
const first = await api('board-sign', { id: a.body.id, form: 1, signature });
assert.equal(first.status, 200);
assert.equal(first.body.pilots.find((p) => p.id === a.body.id).mode, 'foot');
assert.ok(first.body.base.events.some((e) => e.kind === 'stamp'));
await position(bay.entryX, bay.entryZ - 2.5);
assert.equal(
  (await api('board-sign', { id: a.body.id, form: 2, signature })).status,
  409,
  'each document rechecks actual position',
);
await position(bay.entryX, bay.entryZ);
const boarded = await api('board-sign', { id: a.body.id, form: 2, signature });
assert.equal(boarded.status, 200);
assert.equal(boarded.body.pilots.find((p) => p.id === a.body.id).mode, 'flight');
assert.equal(
  boarded.body.base.bodies.some((p) => p.entity === a.body.id && !p.gone),
  false,
);
assert.equal(
  (await api('board-sign', { id: a.body.id, form: 2, signature })).status,
  409,
  'boarding cannot be repeated from the aircraft',
);
const airborne = boarded.body.pilots.find((p) => p.id === a.body.id).state;
const stale = await api('sync', {
  id: a.body.id,
  mode: 'foot',
  state: { ...airborne, p: [99, 20, 99] },
});
assert.deepEqual(
  stale.body.pilots.find((p) => p.id === a.body.id).state.p,
  airborne.p,
  'a late ground update cannot overwrite boarding position',
);
const flying = await api('sync', {
  id: a.body.id,
  mode: 'flight',
  state: { ...airborne, p: [-60, 20, 40] },
});
assert.deepEqual(flying.body.pilots.find((p) => p.id === a.body.id).state.p, [-60, 20, 40]);
assert.equal(
  (await api('sync', { id: b.body.id, state: b.body.state })).body.pilots.find(
    (p) => p.id === b.body.id,
  ).board_paper,
  0,
  'documents are per pilot',
);
await api('reset', { id: a.body.id });
const reset = (await api('sync', { id: a.body.id, state: a.body.state })).body;
assert.ok(reset.pilots.every((p) => p.mode === 'foot' && p.board_paper === 0));
const p = { id: 'test', name: 'T', bay: 0, life: 'alive', mode: 'foot', board_paper: 0 };
p.state = JSON.stringify({
  parked: { p: [baseWorld(bay).x, OFFICE_LAYOUT.base.parkedY, baseWorld(bay).z] },
});
const arena = reconcileBase({ time: 1000 }, [p], 1000);
const body = arena.bodies[0];
body.x = bay.x;
body.z = bay.z;
advanceBase(arena, 1100);
assert.ok(
  Math.abs(body.x - bay.x) > 0.5 || Math.abs(body.z - bay.z) > 1.75,
  'aircraft hull is solid',
);
body.x = bay.entryX;
body.z = bay.entryZ;
assert.equal(baseAccess(body, bay), true);
assert.equal(baseWorld(body).y, OFFICE_LAYOUT.base.deckY);
for (let i = 0; i < 100; i++) {
  const b = aircraftBay(i);
  assert.ok(Math.abs(b.x) < 32 && b.z < 37);
}
const module = await worker.fetch(new Request('https://test.local/base.js'), {});
assert.equal(module.status, 200);
console.log(
  'PASS: physical spawn, concurrent bay reservations, hull collision, real boarding proximity, signed documents/order, interruption, no remote teleport/fire, atomic embarkation, independent dossiers and reset.',
);
