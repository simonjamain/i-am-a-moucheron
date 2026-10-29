import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
import { bodyMotion } from '../src/purgatory-physics.js';
import { vehicleEntry, VEHICLES } from '../src/fleet.js';
import { OFFICE_LAYOUT } from '../src/layout.js';
import { ACTOR_UNIT } from '../src/scale.js';
import {
  fullAmmo,
  ammoCapacity,
  advanceSupplies,
  serviceEligible,
  inRadarCoverage,
  vehicleHue,
  installationCount,
} from '../src/logistics.js';
import { drawClause, clauseFactors, maliciousDocument } from '../src/malice.js';
import { shopPrice } from '../src/equipment.js';
import { createGraphics } from '../src/graphics.js';
import { paintVehicle, updateInscriptions } from '../src/vehicle-livery.js';
import * as T from '../vendor/three.module.min.js';
// Execute the real tear handler, including double activation and a failed request.
const clientSource = readFileSync('src/client.js', 'utf8');
const tearSource = clientSource.slice(
  clientSource.indexOf("$('paperTear').onclick = async () => {"),
  clientSource.indexOf(
    '\nfunction hasAmmo()',
    clientSource.indexOf("$('paperTear').onclick = async () => {"),
  ),
);
async function exerciseTear(annex, fail = false) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        disabled: false,
        textContent: '',
        classList: {
          contains: (k) => classes.has(k),
          add: (k) => classes.add(k),
          remove: (k) => classes.delete(k),
        },
      });
    }
    return elements.get(id);
  };
  let requests = 0,
    accepts = 0,
    clears = 0;
  const context = vm.createContext({
    $,
    boardingBusy: false,
    soulBusy: false,
    pendingAnnex: () => annex,
    clearSignature: () => clears++,
    replacementCounter: 0,
    paperContext: 'old',
    id: 'test',
    setTimeout: (cb) => queueMicrotask(cb),
    api: async () => {
      requests++;
      if (fail) throw Error('Réseau interrompu');
      return { ok: true };
    },
    accept: () => accepts++,
    renderPaper: () => {
      $('paperMessage').textContent = '';
    },
  });
  vm.runInContext(tearSource, context);
  const first = $('paperTear').onclick();
  const second = $('paperTear').onclick();
  assert.equal(context.boardingBusy, true);
  await second;
  await first;
  assert.equal(context.boardingBusy, false);
  assert.equal(clears, 1);
  assert.equal($('papers').classList.contains('tearing'), false);
  assert.equal(requests, annex ? 1 : 0);
  assert.equal(accepts, annex && !fail ? 1 : 0);
  assert.equal(context.replacementCounter, fail ? 0 : 1);
  assert.ok($('paperMessage').textContent.includes(fail ? 'Réseau interrompu' : 'déchiré'));
}
await exerciseTear(null);
await exerciseTear({ token: 'annex' });
await exerciseTear({ token: 'annex' }, true);
const DB = localDB();
let now = Date.now();
const realNow = Date.now;
Date.now = () => now;
async function api(path, data, status = 200) {
  const r = await worker.fetch(
    new Request('https://test/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  const b = await r.json();
  assert.equal(r.status, status, JSON.stringify(b));
  return b;
}
// Exhaustively sample the probability interval rather than asserting a flaky random frequency.
let count = 0;
for (let i = 0; i < 10000; i++) {
  let n = 0;
  const c = drawClause('dorsal', true, () => (n++ === 0 ? (i + 0.5) / 10000 : 0.5));
  if (c) {
    count++;
    assert.ok(['aim', 'damage', 'cadence'].includes(c));
  }
}
assert.equal(count, 500);
for (let i = 0; i < 100; i++)
  assert.equal(
    drawClause('pilot', false, () => 0.01),
    'inverse',
  );
assert.deepEqual(clauseFactors('damage'), { controls: 1, aim: 1, damage: 0.5, interval: 1 });
assert.equal(clauseFactors('cadence').interval, 2);
assert.equal(clauseFactors('inverse').controls, -1);
assert.equal(clauseFactors('aim').aim, -1);
for (const type of Object.keys(VEHICLES)) {
  const ammo = fullAmmo(type),
    state = { p: [0, 1, 0], v: [0, 0, -0.1], landed: false, hp: 100, engine: 1, gas: 1 };
  let supply = { fuel: 300, ammo };
  for (let i = 0; i < 3000; i++) supply = advanceSupplies(supply, state, type, [], 0.1);
  assert.ok(supply.fuel < 1e-8);
  assert.equal(
    advanceSupplies({ fuel: 300, ammo }, { ...state, gas: 0.5 }, type, [], 300).fuel,
    150,
  );
  assert.equal(
    advanceSupplies({ fuel: 100, ammo }, { ...state, engine: 0 }, type, [], 300).fuel,
    100,
  );
  for (const seat of VEHICLES[type].seats.filter(() => !['tank', 'spitfire'].includes(type)))
    assert.ok(
      !ammo[seat] ||
        Math.abs(ammoCapacity(type, seat) * (seat === 'pilot' ? 0.06 : 0.09) - 60) < 0.05,
    );
  const station = { kind: 'refuel', x: 0, y: 0.9, z: 0 };
  const parked = { ...state, p: [0, 0.9 + VEHICLES[type].gear, 0], v: [0, 0, 0], landed: true };
  assert.ok(serviceEligible(parked, [station], type));
  for (const bad of [
    { ...parked, landed: false },
    { ...parked, v: [0.001, 0, 0] },
    { ...parked, p: [0.121, parked.p[1], 0] },
    { ...parked, p: [0, parked.p[1] + 0.1, 0] },
  ])
    assert.ok(!serviceEligible(bad, [station], type));
  const empty = { fuel: 0, ammo: Object.fromEntries(Object.keys(ammo).map((s) => [s, 0])) };
  const half = advanceSupplies(empty, parked, type, [station, station], 5);
  assert.equal(half.fuel, 150);
  const full = advanceSupplies(half, parked, type, [station], 5);
  assert.equal(full.fuel, 300);
  assert.deepEqual(full.ammo, ammo);
  assert.deepEqual(advanceSupplies(full, parked, type, [station], 30).ammo, ammo);
}
const radar = { kind: 'radar', x: 0, y: 0, z: 0 };
assert.ok(!inRadarCoverage({ x: 0, y: 0, z: 0 }, []));
assert.ok(inRadarCoverage({ x: 0, y: 1, z: 0 }, [radar]));
assert.ok(!inRadarCoverage({ x: 0, y: 1.0001, z: 0 }, [radar]));
assert.ok(inRadarCoverage({ x: 1.5, y: 0, z: 0 }, [radar, { ...radar, x: 1 }]));
assert.equal(shopPrice('refuel', {}, 2), 8);
assert.equal(shopPrice('radar', {}, 0), 4);
assert.equal(
  installationCount(
    [{ kind: 'refuel', free: true }, { kind: 'radar' }, { kind: 'refuel' }],
    'refuel',
  ),
  1,
);
// Real mesh paint and hull inscription lifecycle.
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const model = graphics.makeBomber('#c5ba92');
paintVehicle(T, model, 1, '#c5ba92');
const canvases = [];
const factory = () => {
  const c = { width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) };
  canvases.push(c);
  return c;
};
const v = {
  type: 'bomber',
  seats: [
    { seat: 'pilot', pilot: 'a' },
    { seat: 'tail', pilot: 'b' },
  ],
};
updateInscriptions(
  T,
  model,
  v,
  [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  factory,
);
assert.equal(model.userData.inscriptions.length, 4);
assert.ok(
  model.userData.inscriptions.every(
    (m) => m.isMesh && !m.isSprite && m.userData.projectileSolid === false,
  ),
);
const old = model.userData.inscriptions;
let disposed = 0;
old.forEach((m) => m.material.map.addEventListener('dispose', () => disposed++));
updateInscriptions(
  T,
  model,
  v,
  [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  factory,
);
assert.equal(canvases.length, 2);
updateInscriptions(T, model, { ...v, seats: [] }, [], factory);
assert.equal(disposed, 4);
assert.equal(model.userData.inscriptions.length, 0);
assert.notEqual(vehicleHue(1), vehicleHue(2));
assert.equal(vehicleHue(3), vehicleHue(3));
// Force the optional branch only in this integration fixture.
globalThis.crypto.getRandomValues = (a) => {
  a.fill(0);
  return a;
};
const a = await api('join', { code: 'LOGISTICS', name: 'A' }),
  b = await api('join', { code: 'LOGISTICS', name: 'B' });
let snap = b.snapshot;
let vehicle = snap.vehicles.find((v) => v.type === 'fighter');
async function ground(player, world) {
  const s = await api('sync', { id: player.id, state: player.state });
  const body = s.base.bodies.find((b) => b.entity === player.id);
  Object.assign(body, {
    x: (world.x - OFFICE_LAYOUT.base.originX) / ACTOR_UNIT,
    z: (OFFICE_LAYOUT.base.originZ - world.z) / ACTOR_UNIT,
    y: world.y,
    vx: 0,
    vz: 0,
    grounded: true,
    parachute: false,
  });
  return { epoch: s.base.epoch, body: bodyMotion(body) };
}
let g = await ground(a, vehicleEntry(vehicle));
snap = await api('vehicle-select', { id: a.id, vehicle: vehicle.id, seat: 'pilot', ground: g });
let dossier = snap.dossiers.find((d) => d.pilot === a.id);
assert.ok(dossier.clause);
const token = dossier.token;
const reopened = await api('vehicle-select', {
  id: a.id,
  vehicle: vehicle.id,
  seat: 'pilot',
  ground: g,
});
assert.equal(reopened.dossiers.find((d) => d.pilot === a.id).token, token);
assert.deepEqual(maliciousDocument(dossier), maliciousDocument(dossier));
// Put annex between the two mandatory documents; neither refusal nor extra signature grants access.
await DB.prepare("UPDATE access_dossiers SET position=1,clause='damage' WHERE token=?")
  .bind(token)
  .run();
snap = await api('vehicle-sign', {
  id: a.id,
  vehicle: vehicle.id,
  seat: 'pilot',
  form: 1,
  signature: true,
  ground: g,
});
assert.equal(snap.pilots.find((p) => p.id === a.id).board_paper, 1);
await api(
  'vehicle-sign',
  { id: a.id, vehicle: vehicle.id, seat: 'pilot', form: 2, signature: true, ground: g },
  409,
);
const outcomes = await Promise.allSettled([
  api('dossier-choice', { id: a.id, token, choice: 'sign', signature: true }),
  api('dossier-choice', { id: a.id, token, choice: 'tear' }),
]);
assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
const choice = (
  await DB.prepare('SELECT choice FROM access_dossiers WHERE token=?').bind(token).first()
).choice;
await api('dossier-choice', { id: a.id, token, choice, signature: true });
snap = await api('vehicle-sign', {
  id: a.id,
  vehicle: vehicle.id,
  seat: 'pilot',
  form: 2,
  signature: true,
  ground: g,
});
assert.equal(snap.pilots.find((p) => p.id === a.id).mode, 'flight');
assert.equal(
  snap.pilots.find((p) => p.id === a.id).contractClause,
  choice === 'sign' ? 'damage' : null,
);
const fuel = snap.vehicles.find((v) => v.id === vehicle.id).supplies;
assert.equal(fuel.fuel, 300);
assert.equal(fuel.ammo.pilot, 1000);
assert.ok(snap.initialStation.free);
assert.ok(snap.equipment.length === 0);
// A projectile spends once across duplicate requests; exhausted stock cannot emit.
const shots = await Promise.all([
  api('aircraft-fire', { id: a.id, shot: 'test-round' }),
  api('aircraft-fire', { id: a.id, shot: 'test-round' }),
]);
assert.ok(shots.every((s) => s.allowed));
let resources = await DB.prepare('SELECT * FROM vehicle_supplies WHERE vehicle=?')
  .bind(vehicle.id)
  .first();
assert.equal(JSON.parse(resources.ammo).pilot, 999);
// Several predicted rounds settle in one request; retries still debit once.
const batchReport = {
  id: a.id,
  vehicle: vehicle.id,
  seat: 'pilot',
  shots: ['batch-a', 'batch-b', 'batch-c'],
};
const batchReplies = await Promise.all([
  api('aircraft-fire', batchReport),
  api('aircraft-fire', batchReport),
]);
assert.ok(batchReplies.every((reply) => reply.shots.length === 3));
assert.equal(
  JSON.parse(
    (await DB.prepare('SELECT ammo FROM vehicle_supplies WHERE vehicle=?').bind(vehicle.id).first())
      .ammo,
  ).pilot,
  996,
);
await api('aircraft-fire', { id: a.id, shots: [] }, 400);
await api('aircraft-fire', { id: a.id, shots: ['duplicate', 'duplicate'] }, 400);
await api(
  'aircraft-fire',
  { id: a.id, shots: Array.from({ length: 33 }, (_, i) => 'too-many:' + i) },
  400,
);
await api('aircraft-fire', { id: a.id, shots: ['used:batch-a'] }, 400);
await DB.prepare('UPDATE vehicle_supplies SET ammo=? WHERE vehicle=?')
  .bind('{"pilot":1}', vehicle.id)
  .run();
await api('aircraft-fire', { id: a.id, shot: 'last-round' });
assert.equal((await api('aircraft-fire', { id: a.id, shot: 'empty-round' })).allowed, false);
assert.equal(
  JSON.parse(
    (await DB.prepare('SELECT ammo FROM vehicle_supplies WHERE vehicle=?').bind(vehicle.id).first())
      .ammo,
  ).pilot,
  0,
);
// Engine consumption is computed from elapsed server time, with no refill on airborne or moving reports.
let state = { ...vehicle.state, p: [0, 1.5, 0], v: [0, 0, -0.1], landed: false, gas: 1 };
await api('sync', { id: a.id, mode: 'flight', state });
// A delayed request must not move the resource clock backwards and charge the
// same second twice. Simulate an earlier request reaching supplies after a newer one.
now += 1000;
snap = await api('sync', { id: a.id, mode: 'flight', state });
const settledFuel = snap.vehicles.find((v) => v.id === vehicle.id).supplies.fuel;
const settledAt = now;
now -= 1000;
await api('sync', { id: a.id, mode: 'flight', state });
assert.equal(
  (
    await DB.prepare('SELECT updated FROM vehicle_supplies WHERE vehicle=?')
      .bind(vehicle.id)
      .first()
  ).updated,
  settledAt,
  'a delayed request must not rewind the supply clock',
);
now = settledAt;
snap = await api('sync', { id: a.id, mode: 'flight', state });
assert.equal(snap.vehicles.find((v) => v.id === vehicle.id).supplies.fuel, settledFuel);
for (let i = 0; i < 300; i++) {
  now += 1000;
  snap = await api('sync', { id: a.id, mode: 'flight', state });
}
assert.ok(snap.vehicles.find((v) => v.id === vehicle.id).supplies.fuel < 1e-8);
// Rejoin does not refill supplies or reassign its paint sequence.
const sequence = snap.vehicles.find((v) => v.id === vehicle.id).supplies.sequence;
const c = await api('join', { code: 'LOGISTICS', name: 'C' });
assert.equal(c.snapshot.vehicles.find((v) => v.id === vehicle.id).supplies.sequence, sequence);
assert.equal(c.snapshot.vehicles.find((v) => v.id === vehicle.id).supplies.fuel, 0);
// Return, stop, then fill all reservoirs in parallel in exactly ten seconds.
state = { ...state, p: vehicle.state.p, v: [0, 0, 0], landed: true, gas: 0 };
await api('sync', { id: a.id, mode: 'flight', state });
for (let i = 0; i < 10; i++) {
  now += 1000;
  snap = await api('sync', { id: a.id, mode: 'flight', state });
}
resources = snap.vehicles.find((v) => v.id === vehicle.id).supplies;
assert.equal(resources.fuel, 300);
assert.equal(resources.ammo.pilot, 1000);
snap = await api('vehicle-exit', { id: a.id, state });
assert.equal(snap.pilots.find((p) => p.id === a.id).contractClause, null);
assert.equal(snap.vehicles.find((v) => v.id === vehicle.id).supplies.ammo.pilot, 1000);
// New installations use independent price curves and the same transaction guards.
await DB.prepare("UPDATE rooms SET dollars=100 WHERE code='LOGISTICS'").run();
const position = { x: -1.5, y: 0.90005, z: 1.885 };
g = await ground(c, { ...position, z: 1.9 });
await api('buy', {
  id: c.id,
  item: 'radar',
  request: 'radar-first',
  expectedPrice: 4,
  position,
  ground: g,
});
const next = { x: -1.65, y: 0.90005, z: 1.885 };
g = await ground(c, { ...next, z: 1.9 });
snap = await api('buy', {
  id: c.id,
  item: 'refuel',
  request: 'refuel-first',
  expectedPrice: 4,
  position: next,
  ground: g,
});
assert.equal(snap.dollars, 92);
assert.equal(snap.equipment.filter((e) => e.kind === 'radar').length, 1);
assert.equal(snap.equipment.filter((e) => e.kind === 'refuel').length, 1);
await api(
  'buy',
  {
    id: c.id,
    item: 'radar',
    request: 'overlap-radar',
    expectedPrice: 6,
    position: next,
    ground: g,
  },
  409,
);
await api(
  'buy',
  {
    id: c.id,
    item: 'refuel',
    request: 'stale-refuel',
    expectedPrice: 4,
    position: next,
    ground: g,
  },
  409,
);

const d = await api('join', { code: 'LOGISTICS', name: 'D' }),
  e = await api('join', { code: 'LOGISTICS', name: 'E' });
const bomber = snap.vehicles.find((v) => v.type === 'bomber');
async function boardWithClause(player, seat, clause, choice = 'sign') {
  const report = await ground(player, vehicleEntry(bomber));
  let s = await api('vehicle-select', { id: player.id, vehicle: bomber.id, seat, ground: report });
  const dossier = s.dossiers.find((d) => d.pilot === player.id);
  await DB.prepare('UPDATE access_dossiers SET clause=?,position=0 WHERE token=?')
    .bind(clause, dossier.token)
    .run();
  await api('dossier-choice', { id: player.id, token: dossier.token, choice, signature: true });
  await api('vehicle-sign', {
    id: player.id,
    vehicle: bomber.id,
    seat,
    ground: report,
    form: 1,
    signature: true,
  });
  return api('vehicle-sign', {
    id: player.id,
    vehicle: bomber.id,
    seat,
    ground: report,
    form: 2,
    signature: true,
  });
}
await boardWithClause(d, 'dorsal', 'damage');
snap = await boardWithClause(e, 'tail', 'aim', 'tear');
assert.equal(snap.pilots.find((p) => p.id === d.id).contractClause, 'damage');
assert.equal(snap.pilots.find((p) => p.id === e.id).contractClause, null);
// Other seats' weapon damage remains 75; the accepted seat deals exactly 37.5.
await api('friendly-hit', { id: d.id, target: c.id, shot: 'half-damage' });
let health = (await DB.prepare('SELECT health FROM pilots WHERE id=?').bind(c.id).first()).health;
assert.equal(health, 62.5);
await api('friendly-hit', { id: e.id, target: d.id, shot: 'full-damage' });
assert.equal(
  (await DB.prepare('SELECT health FROM pilots WHERE id=?').bind(d.id).first()).health,
  25,
);
await DB.prepare('UPDATE vehicle_supplies SET ammo=? WHERE vehicle=?')
  .bind('{"pilot":0,"dorsal":1,"tail":2}', bomber.id)
  .run();
await Promise.all([
  api('aircraft-fire', { id: d.id, shot: 'dorsal-1' }),
  api('aircraft-fire', { id: e.id, shot: 'tail-1' }),
]);
const stock = JSON.parse(
  (await DB.prepare('SELECT ammo FROM vehicle_supplies WHERE vehicle=?').bind(bomber.id).first())
    .ammo,
);
assert.equal(stock.dorsal, 0);
assert.equal(stock.tail, 1);
assert.equal((await api('aircraft-fire', { id: d.id, shot: 'dorsal-empty' })).allowed, false);
await api(
  'aircraft-fire',
  { id: e.id, vehicle: bomber.id, seat: 'dorsal', shot: 'wrong-seat' },
  409,
);
// Free-seat transfer removes the previous occupant's effect, without refilling either stock.
snap = await api('seat-request', { id: d.id, seat: 'pilot' });
const transfer = snap.seatRequests.find((r) => r.requester === d.id);
await api('dossier-choice', { id: d.id, token: transfer.id + ':' + d.id, choice: 'tear' });
snap = await api('seat-sign', { id: d.id, request: transfer.id, signature: true });
assert.equal(snap.pilots.find((p) => p.id === d.id).contractClause, null);
assert.equal(snap.vehicles.find((v) => v.id === bomber.id).supplies.ammo.dorsal, 0);
// Two aircraft share a service area, never its filling rate.
const service = snap.initialStation;
for (const vehicle of snap.vehicles) {
  const pose = {
    ...vehicle.state,
    p: [service.x, service.y + VEHICLES[vehicle.type].gear, service.z],
    v: [0, 0, 0],
    landed: true,
    gas: 0,
  };
  await DB.prepare('UPDATE vehicles SET state=?,ready=0 WHERE id=?')
    .bind(JSON.stringify(pose), vehicle.id)
    .run();
  await DB.prepare('UPDATE vehicle_supplies SET fuel=0,ammo=?,updated=? WHERE vehicle=?')
    .bind(
      JSON.stringify(Object.fromEntries(VEHICLES[vehicle.type].seats.map((seat) => [seat, 0]))),
      now,
      vehicle.id,
    )
    .run();
}
now += 10000;
snap = await api('sync', { id: e.id, state: e.state });
assert.ok(snap.vehicles.filter((v) => v.supplies.fuel === 300).length >= 2);
Date.now = realNow;
console.log(
  'PASS: golden-angle paint/hull inscriptions, fixed optional dossiers, refusal/sign races, exclusive effects, timed shared fuel/ammo, projectile deduplication, refuel eligibility/parallel filling, independent purchases and spherical radar coverage.',
);
