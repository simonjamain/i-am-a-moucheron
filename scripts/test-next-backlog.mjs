import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { amortization, newBank, signLoan, settleLoans, repayLoan } from '../src/bank.js';
import { Game } from '../server/game.js';
import { VEHICLES, vehicleEntry, vehicleAccess } from '../src/fleet.js';
import { fullAmmo, advanceSupplies, SERVICE_SECONDS } from '../src/logistics.js';
import { TANK_MG, HEAVY, availableShell, heavyDamage } from '../src/armament.js';
import { HoldZoom, contextKey, rangeReadout } from '../src/equipment-controls.js';
import { MAP, ACTOR_UNIT, REFERENCE } from '../src/scale.js';
import { stepTank } from '../src/tank.js';
import { wavePlan } from '../src/waves.js';
import { enemyRoute } from '../src/routes.js';
import { blockedSegment } from '../src/route-navigation.js';
import { createGraphics } from '../src/graphics.js';
import { CrashEffects } from '../src/crash-effects.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';

for (const [principal, rate, waves] of [
  [1200, 0.04, 4],
  [2400, 0.05, 6],
  [4000, 0.06, 8],
  [1201, 0, 7],
]) {
  const p = amortization(principal, rate, waves);
  assert.equal(p.schedule.at(-1).remaining, 0);
  assert.equal(
    p.schedule.reduce((n, r) => n + r.capital, 0),
    principal,
  );
  for (const r of p.schedule.slice(0, -1)) assert.equal(r.payment, p.payment);
  assert.equal(p.total, principal + p.schedule.reduce((n, r) => n + r.interest, 0));
}
const bank = newBank(() => 0);
const stable = JSON.stringify(bank.slots);
assert.equal(bank.slots.length, 3);
assert.equal(JSON.stringify(bank.slots), stable);
let cash = 0;
for (let slot = 0; slot < 3; slot++) cash += signLoan(bank, slot, slot + 1, cash, 0);
assert.equal(cash, 3600);
assert.throws(() => signLoan(bank, 0, 1, cash, 0));
const debit = settleLoans(bank, 1, () => 0.3);
assert.equal(debit, 1137);
assert.equal(settleLoans(bank, 1), 0);
for (let wave = 2; wave <= 4; wave++) cash -= settleLoans(bank, wave, () => 0.3);
assert.ok(bank.slots.every((s) => s.status === 'offer'));
assert.ok(bank.slots.every((s) => s.serial > 3));
assert.throws(() => signLoan(bank, 0, bank.slots[0].serial, -1, 4), /négatif/);
signLoan(bank, 0, bank.slots[0].serial, 0, 4);
assert.throws(() => repayLoan(bank, 0, bank.slots[0].serial, 0), /insuffisant/);
const paid = repayLoan(bank, 0, bank.slots[0].serial, 10000, () => 0.5);
assert.ok(paid > 0);
assert.equal(bank.slots[0].status, 'offer');
const zoom = new HoldZoom();
zoom.press('tank:cannon');
assert.equal(zoom.fov('tank:cannon'), 28);
assert.equal(zoom.fov('tank:top'), 62);
zoom.press('dca');
zoom.reset();
assert.equal(zoom.fov('dca'), 62);
assert.deepEqual(contextKey({ turret: true }, 'ShiftLeft'), { range: 25 });
assert.deepEqual(contextKey({ type: 'tank' }, 'ControlLeft'), { shell: 'ap' });
assert.equal(rangeReadout(300).metres, 0.9);
assert.equal(rangeReadout(100).fraction, 0);
assert.equal(rangeReadout(1200).fraction, 1);
const ammo = fullAmmo('tank');
for (const key of ['pilot', 'coax', 'top'])
  assert.ok(Math.abs(ammo[key] * TANK_MG[key].interval - 90) < 0.1);
assert.equal(ammo.he * HEAVY.he.interval, 60);
assert.equal(ammo.ap * HEAVY.ap.interval, 60);
assert.equal(availableShell({ he: 0, ap: 2 }, 'he'), 'ap');
assert.equal(availableShell({ he: 0, ap: 0 }), null);
assert.ok(heavyDamage('he', 0) > heavyDamage('he', HEAVY.he.radius));
assert.equal(heavyDamage('he', HEAVY.he.radius + 1), 0);
let now = 100000;
const game = new Game({ now: () => now, solids: OFFICE_SOLIDS }),
  join = game.join({ code: 'NEXT' }),
  r = game.rooms.get('NEXT'),
  p = r.pilots.get(join.id);
// These pre-existing weapon tests seed hulls through the internal domain helper.
// Public signed placement is covered by test-multiplayer-return.
const call = (path, b = {}) =>
  path === 'buy' && VEHICLES[b.item]
    ? (game.buy(r, p, b), game.snapshot(r))
    : game.command('NEXT', p.id, path, b);
// Hull destruction must free every crew member without relying on a later
// client death command, including a disconnected driver's final motion.
const wreckGame = new Game({ now: () => now, solids: OFFICE_SOLIDS });
const driverJoin = wreckGame.join({ code: 'WRECK' });
const gunnerJoin = wreckGame.join({ code: 'WRECK' });
const wreckRoom = wreckGame.rooms.get('WRECK');
const wreck = [...wreckRoom.vehicles.values()].find((v) => v.type === 'bomber');
const crew = [driverJoin, gunnerJoin].map((j) => wreckRoom.pilots.get(j.id));
wreckGame.assign(wreckRoom, crew[0], wreck, 'pilot', null);
wreckGame.assign(wreckRoom, crew[1], wreck, 'dorsal', null);
wreck.state.hp = 0;
wreckGame.advance(wreckRoom);
assert.equal(wreck.seats.size, 0);
assert.ok(crew.every((member) => member.life === 'dead' && member.state.realm === 'purgatory'));
const incarnations = crew.map((member) => member.incarnation);
wreckGame.advance(wreckRoom);
assert.deepEqual(
  crew.map((member) => member.incarnation),
  incarnations,
);
assert.equal(wreckRoom.effects.filter((event) => event.kind === 'crash').length, 1);
assert.equal([...wreckRoom.souls.values()].filter((soul) => soul.kind === 'player').length, 0);
assert.ok(crew.every((p) => p.state.awaitingPurgatory));
const fighter = [...r.vehicles.values()].find((v) => v.type === 'fighter');
fighter.state.landed = false;
fighter.ready = 0;
game.fleet(r);
assert.equal(
  [...r.vehicles.values()].filter((v) => v.type === 'fighter').length,
  2,
  'takeoff renews one free starter',
);
fighter.state.hp = 0;
game.advance(r);
assert.equal(
  [...r.vehicles.values()].filter((v) => v.type === 'fighter' && v.state.hp > 0).length,
  1,
);
r.dollars = 100;
call('buy', { item: 'interceptor', request: 'stuka-order' });
call('buy', { item: 'interceptor', request: 'stuka-order' });
let stuka = [...r.vehicles.values()].find((v) => v.type === 'interceptor');
assert.equal([...r.vehicles.values()].filter((v) => v.type === 'interceptor').length, 1);
stuka.state.hp = 0;
game.advance(r);
assert.equal(
  [...r.vehicles.values()].filter((v) => v.type === 'interceptor' && v.state.hp > 0).length,
  0,
);
call('buy', { item: 'interceptor', request: 'stuka-order-2' });
stuka = [...r.vehicles.values()].find((v) => v.type === 'interceptor' && v.state.hp > 0);
assert.ok(VEHICLES.interceptor.maxSpeed < VEHICLES.fighter.maxSpeed);
assert.ok(VEHICLES.interceptor.turn < VEHICLES.fighter.turn);
call('buy', { item: 'tank', request: 'tank-order' });
const tank = [...r.vehicles.values()].find((v) => v.type === 'tank');
for (const seat of VEHICLES.tank.seats) {
  const entry = vehicleEntry(tank, seat);
  assert.ok(vehicleAccess(entry, tank, seat));
  for (const other of VEHICLES.tank.seats)
    if (other !== seat) assert.equal(vehicleAccess(entry, tank, other), false);
}
// Independent gunner fires without any driver. Heavy reports spend once and
// one cannon cooldown spans both ammunition types.
game.assign(r, p, tank, 'cannon', null);
tank.state.landed = false;
assert.equal(tank.seats.has('pilot'), false);
const he = tank.supplies.ammo.he;
call('heavy-fire', { weapon: 'he', shot: 'he-1', direction: [0, 0, -1] });
call('heavy-fire', { weapon: 'he', shot: 'he-1', direction: [0, 0, -1] });
assert.equal(tank.supplies.ammo.he, he - 1);
assert.throws(
  () => call('heavy-fire', { weapon: 'ap', shot: 'ap-fast', direction: [0, 0, -1] }),
  /recharge/,
);
now += 2100;
tank.supplies.ammo.he = 0;
call('heavy-fire', { weapon: 'he', shot: 'fallback', direction: [0, 0, -1] });
assert.equal(tank.supplies.ammo.ap, 29);
const coax = tank.supplies.ammo.coax;
call('aircraft-fire', { weapon: 'coax', shots: ['coax-1'] });
call('aircraft-fire', { weapon: 'coax', shots: ['coax-1'] });
assert.equal(tank.supplies.ammo.coax, coax - 1);
assert.equal(tank.supplies.ammo.top, fullAmmo('tank').top);
tank.state.landed = true;
tank.state.v = [0, 0, 0];
const pos = [...tank.state.p];
call('vehicle-exit');
assert.ok(r.vehicles.has(tank.id));
assert.deepEqual(tank.state.p, pos);
assert.equal(tank.supplies.ammo.coax, coax - 1);
const supply = {
  fuel: 0,
  ammo: Object.fromEntries(Object.keys(fullAmmo('tank')).map((k) => [k, 0])),
};
const station = { kind: 'refuel', x: pos[0], y: pos[1] - VEHICLES.tank.gear, z: pos[2] };
const restored = advanceSupplies(
  supply,
  { ...tank.state, landed: true, v: [0, 0, 0] },
  'tank',
  [station],
  SERVICE_SECONDS,
);
assert.deepEqual(restored.ammo, fullAmmo('tank'));
game.assign(r, p, stuka, 'pilot', null);
stuka.state.p = [0, 1, 0];
stuka.state.v = [0, 0, 0];
const stock = stuka.supplies.ammo.bomb;
call('heavy-fire', { weapon: 'bomb', shot: 'bomb1', direction: [0, 0, -1] });
assert.equal(stuka.supplies.ammo.bomb, stock - 1);
// A real bomb reaches a support and produces one shared blast; repeated polls
// cannot create a second explosion.
now += 9000;
p.seen = now;
game.advance(r);
const blasts = r.effects.filter((e) => e.shot === 'bomb1');
assert.equal(blasts.length, 1);
game.advance(r);
assert.equal(r.effects.filter((e) => e.shot === 'bomb1').length, 1);
// Stable bank slots and atomic signature credit on the actual room API.
const offer = call('sync', { state: p.state, mode: p.mode }).bank.slots[0],
  balance = r.dollars;
call('bank-sign', { slot: 0, serial: offer.serial, signature: true });
assert.equal(r.dollars, balance + offer.principal / 100);
assert.throws(() => call('bank-sign', { slot: 0, serial: offer.serial, signature: true }));
for (const slot of [1, 2]) {
  const o = r.bank.slots[slot];
  call('bank-sign', { slot, serial: o.serial, signature: true });
}
r.dollars = 0;
r.phase = 'combat';
r.wave = 1;
r.started = now;
const expected = r.bank.slots.reduce((n, loan) => n + loan.schedule[0].payment, 0);
for (const e of wavePlan(r.code, 1, now).roster) r.kills.add(e.id);
game.advance(r);
assert.equal(r.dollars, (400 - expected) / 100);
assert.ok(r.dollars < 0);
const afterWave = r.dollars;
game.advance(r);
assert.equal(r.dollars, afterWave, 'one debit per end of wave');
// New heavy weapons keep the promised contract cadence and damage factors.
game.assign(r, p, tank, 'cannon', null);
tank.state.landed = false;
const d = game.dossier(r, p, tank.id, 'cannon');
d.active = 1;
d.choice = 'sign';
d.clause = 'cadence';
now += 4000;
p.seen = now;
tank.supplies.ammo.he = 10;
call('heavy-fire', { weapon: 'he', shot: 'slow-heavy', direction: [0, 0, -1] });
now += 2100;
p.seen = now;
assert.throws(
  () => call('heavy-fire', { weapon: 'he', shot: 'too-early', direction: [0, 0, -1] }),
  /recharge/,
);
now += 2000;
p.seen = now;
d.clause = 'damage';
call('heavy-fire', { weapon: 'he', shot: 'half-heavy', direction: [0, 0, -1] });
assert.equal(r.ordnance.find((p) => p.shot === 'half-heavy').bonus, 0.5);
let state = { ...tank.state, p: [0, VEHICLES.tank.gear, 0], q: [0, 0, 0, 1], v: [0, 0, 0] };
for (let i = 0; i < 120; i++)
  stepTank(T, state, { forward: 1, turn: 0 }, [], 1 / 120, VEHICLES.tank);
assert.ok(state.p[2] < 0);
assert.equal(state.landed, true);
const wall = new T.Box3(new T.Vector3(-1, 0, -0.05), new T.Vector3(1, 1, -0.04));
for (let i = 0; i < 240; i++)
  stepTank(T, state, { forward: 1, turn: 0 }, [wall], 1 / 120, VEHICLES.tank);
assert.ok(state.p[2] > wall.max.z, 'tank cannot drive through wall');
for (let seed = 0; seed < 8; seed++)
  for (const wave of [1, 3, 6, 12])
    for (const e of wavePlan('NAV' + seed, wave, seed).roster) {
      const route = enemyRoute(e);
      assert.ok(Math.abs((e.duration - e.entryHold) * e.travelSpeed - route.length) < 1e-8);
      for (let i = 1; i < route.points.length; i++)
        assert.equal(blockedSegment(route.points[i - 1], route.points[i], e.ground), false);
      if (wave === 1) assert.ok(e.spawn + e.duration > 100);
    }
// Heavy damage and soul release are authoritative, independently of visuals.
const targetJoin = game.join({ code: 'GROUND' }),
  targets = game.rooms.get('GROUND');
targets.phase = 'combat';
targets.wave = 12;
targets.started = now;
const roster = wavePlan('GROUND', 12, now).roster,
  ground = roster.find((e) => e.type === 'ant');
assert.ok(ground);
const centre = [0, 0.1, 0],
  frames = roster.map((e) => (e.id === ground.id ? { p: centre } : null));
game.ordnanceImpact(
  targets,
  { weapon: 'bomb', shot: 'ground-bomb', bonus: 1, wave: 12 },
  { enemy: ground.id },
  frames,
  centre,
);
assert.ok(targets.kills.has(ground.id), 'a bomb destroys a ground enemy');
assert.equal([...targets.souls.values()].filter((s) => s.entity === '12:' + ground.id).length, 1);
assert.ok(heavyDamage('bomb', 0, 1.35) > heavyDamage('bomb', 0));
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const model = graphics.makeStuka('#ffffff'),
  tankModel = graphics.makeTank('#ffffff');
assert.equal(tankModel.userData.turrets.length, 2);
let impacts = 0;
const crashes = new CrashEffects(T, scene, { limit: 2, blast: () => impacts++ });
crashes.add(
  { vehicle: 'a', at: now, p: [0, 0.001, 0], q: [0, 0, 0, 1], v: [0, -0.1, 0] },
  model,
  now,
);
crashes.add(
  { vehicle: 'a', at: now, p: [0, 0.001, 0], q: [0, 0, 0, 1], v: [0, -0.1, 0] },
  model,
  now,
);
assert.equal(crashes.items.size, 1);
for (let i = 0; i < 600; i++) crashes.update(1 / 120, []);
assert.equal(impacts, 1);
assert.equal(crashes.items.size, 0);
crashes.add(
  { vehicle: 'late', at: now - 10000, p: [0, 0.001, 0], q: [0, 0, 0, 1], v: [0, -0.1, 0] },
  model,
  now,
  [],
);
assert.equal(crashes.items.size, 0, 'late snapshots do not replay a finished crash');
const falling = { ...state, p: [0, 0.1, 0], v: [0, -0.01, 0], landed: false, hp: 100 };
stepTank(T, falling, { forward: 0, turn: 0 }, [], 0.1, VEHICLES.tank);
assert.ok(falling.p[1] < 0.1, 'driverless tank continues falling');
console.log(
  'Next backlog: amortization, debt/slots, zoom/context, supply independence, renewable/purchased hulls, role access, heavy weapons/dedup/reload, terrain driving, deterministic obstacle-free routes, bounded crash effects.',
);
