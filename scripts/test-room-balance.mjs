import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { DEFAULT_BALANCE, BALANCE_FIELDS, validateBalance, scaleRoster } from '../src/balance.js';
import { BalanceUI } from '../src/balance-ui.js';
import { wavePlan, swarmFrame } from '../src/waves.js';
import { ammoCapacity, advanceSupplies, fullAmmo, FUEL_SECONDS } from '../src/logistics.js';
import { shopPrice } from '../src/equipment.js';
import { HEAVY } from '../src/armament.js';
let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'BALANCE', name: 'Créateur' });
const b = game.join({ code: 'BALANCE', name: 'Invité' });
const other = game.join({ code: 'OTHER' });
const r = game.rooms.get('BALANCE');
const call = (id, path, body = {}) => {
  for (const room of game.rooms.values()) for (const p of room.pilots.values()) p.seen = now;
  return game.command(
    'BALANCE',
    id,
    path,
    path === 'sync'
      ? { state: r.pilots.get(id).state, mode: r.pilots.get(id).mode, ...body }
      : body,
  );
};
const change = (values) =>
  call(a.id, 'balance', { epoch: r.base.epoch, revision: r.balanceRevision, values });
assert.deepEqual(a.snapshot.balance, DEFAULT_BALANCE);
assert.deepEqual(a.snapshot.balanceOwner, [a.id]);
assert.ok(
  !JSON.stringify(a.snapshot).includes(a.resumeKey),
  'owner secret never appears in snapshots',
);
assert.throws(() => call(b.id, 'balance', { values: { damage: 2 } }), /créateur/);
for (const values of [
  { damage: 0 },
  { pause: 1 },
  { damage: NaN },
  { damage: '2' },
  { fuel: Infinity },
  { damage: 1.1 },
  { noSuchField: 1 },
  [],
  null,
  { damage: 2, pause: -1 },
]) {
  const before = structuredClone(r.balance),
    revision = r.balanceRevision;
  assert.throws(() => change(values), /invalide/);
  assert.deepEqual(r.balance, before);
  assert.equal(r.balanceRevision, revision);
}
assert.throws(() => change(JSON.parse('{"__proto__":2}')), /invalide/);
assert.throws(() => call(a.id, 'balance', { epoch: 'old', revision: 0, values: {} }), /changé/);
change({ initialDelay: 20, pause: 90 });
assert.throws(
  () => call(a.id, 'balance', { epoch: r.base.epoch, revision: 0, values: {} }),
  /changé/,
);
call(a.id, 'start');
assert.equal(r.next_wave_at, now + 20000);
now += 1000;
change({ initialDelay: 5 });
assert.equal(r.next_wave_at, now + 5000, 'shortening gives 5 seconds notice');
now += 5000;
let s = call(a.id, 'sync');
assert.equal(s.wave, 1);
assert.equal(s.total, 24);
assert.deepEqual(s.roster, scaleRoster(wavePlan(r.code, 1, r.started), DEFAULT_BALANCE).roster);
const originalCache = structuredClone(wavePlan(r.code, 1, r.started));
now += 4000;
s = call(a.id, 'sync');
call(a.id, 'hit', { wave: 1, enemy: 0, amount: 25, shot: 'wounded' });
const beforeFrame = swarmFrame(r.plan.roster, (now - r.started) / 1000);
const beforeRoster = structuredClone(r.plan.roster);
const beforeDamage = r.enemyDamage[0];
change({ enemySpeed: 2, enemyHP: 2, population: 2, progression: 2 });
const afterFrame = swarmFrame(r.plan.roster, (now - r.started) / 1000);
assert.equal(r.plan.roster.length, 24, 'composition is frozen until next wave');
assert.equal(r.plan.roster[0].hp, beforeRoster[0].hp * 2);
assert.equal(r.enemyDamage[0], beforeDamage * 2);
for (let i = 0; i < beforeFrame.length; i++) {
  assert.equal(!!beforeFrame[i], !!afterFrame[i]);
  if (beforeFrame[i])
    for (let j = 0; j < 3; j++)
      assert.ok(
        Math.abs(beforeFrame[i].p[j] - afterFrame[i].p[j]) < 1e-10,
        'no enemy position jump',
      );
  else if (beforeRoster[i].spawn > (now - r.started) / 1000)
    assert.equal(r.plan.roster[i].spawn, beforeRoster[i].spawn);
}
assert.deepEqual(
  wavePlan(r.code, 1, r.started),
  originalCache,
  'shared cached plan was not mutated',
);
const vehicle = [...r.vehicles.values()][0];
vehicle.supplies.fuel = 150;
vehicle.supplies.ammo.pilot = ammoCapacity(vehicle.type, 'pilot') / 2;
const revision = vehicle.supplies.revision;
change({ ammo: 2, fuel: 2 });
assert.equal(vehicle.supplies.fuel, 300);
assert.equal(vehicle.supplies.ammo.pilot, ammoCapacity(vehicle.type, 'pilot'));
assert.ok(vehicle.supplies.revision > revision);
const newVehicle = game.createVehicle(r, 'helicopter');
assert.equal(newVehicle.supplies.fuel, 600);
assert.equal(newVehicle.supplies.ammo.rocket, 60);
const serviced = advanceSupplies(
  { fuel: 0, ammo: {} },
  { ...vehicle.state, engine: 0 },
  vehicle.type,
  [],
  1,
  r.balance,
);
assert.equal(serviced.fuel, 0);
assert.equal(fullAmmo('bomber', r.balance).bomb, 100);
assert.equal(FUEL_SECONDS, 300, 'global default unchanged');
change({ damage: 2, prices: 2, rewards: 2 });
const damageBefore = r.enemyDamage[0];
call(a.id, 'hit', { wave: 1, enemy: 0, amount: 10, shot: 'scaled' });
assert.equal(r.enemyDamage[0], damageBefore + 20);
call(a.id, 'hit', { wave: 1, enemy: 0, amount: 10, shot: 'scaled' });
assert.equal(r.enemyDamage[0], damageBefore + 20, 'idempotent damage');
const p = r.pilots.get(a.id);
game.friendly(r, p, { target: b.id, shot: 'friendly-scaled' });
assert.equal(r.pilots.get(b.id).health, 80);
const soul = game.soul(r, 'enemy', 'test', 'Test');
const dollars = r.dollars;
game.releaseSoul(r, soul);
game.releaseSoul(r, soul);
assert.equal(r.dollars, dollars + 2, 'scaled reward exactly once');
change({ rewards: 0.25 });
const fractionalMoney = r.dollars,
  fractionalSounds = r.rewardCount;
for (let i = 0; i < 4; i++) game.releaseSoul(r, game.soul(r, 'enemy', 'fraction-' + i, 'Test'));
assert.equal(r.dollars, fractionalMoney + 1);
assert.equal(
  r.rewardCount,
  fractionalSounds + 1,
  'fractional rewards produce one sound per whole dollar',
);
change({ rewards: 2 });

assert.equal(shopPrice('engine', {}, 0, r.balance), 8);
r.dollars = 100;
call(a.id, 'purchase-sign', {
  epoch: r.base.epoch,
  incarnation: p.incarnation,
  item: 'radar',
  signature: true,
  request: 'paid-radar-order',
  expectedPrice: 8,
});
change({ prices: 3 });
assert.equal(r.purchases.get('paid-radar-order').price, 8, 'paid quote is retained');
assert.throws(
  () => call(a.id, 'buy', { item: 'engine', request: 'stale-engine-price', expectedPrice: 8 }),
  /tarif/,
);
call(a.id, 'buy', { item: 'engine', request: 'current-engine-price', expectedPrice: 12 });
const bomber = game.createVehicle(r, 'bomber');
p.vehicle_id = bomber.id;
p.seat = 'pilot';
p.mode = 'flight';
bomber.seats.set('pilot', p.id);
change({ fireRate: 2 });
const heavy = (shot) => game.heavyFire(r, p, { shot, weapon: 'bomb' });
heavy('heavy-one');
assert.equal(r.ordnance.at(-1).bonus, 2);
assert.throws(() => heavy('heavy-too-soon'), /recharge/);
now += (HEAVY.bomb.interval * 1000) / 2;
heavy('heavy-two');
game.release(r, p);
p.mode = 'foot';
r.ordnance = [];
// Complete the current wave without advancing simulation time by minutes.
for (const enemy of r.plan.roster) r.kills.add(enemy.id);
const balanceBeforeReward = r.dollars;
s = call(a.id, 'sync');
assert.equal(s.phase, 'prep');
assert.equal(s.dollars, balanceBeforeReward + 8);
assert.equal(s.next_wave_at, now + 90000);
change({ pause: 5 });
assert.equal(r.next_wave_at, now + 5000);
call(a.id, 'start');
assert.equal(r.wave, 2);
assert.equal(
  r.plan.budget,
  wavePlan(r.code, 3, r.started).budget,
  'progression affects next director plan',
);
assert.equal(r.plan.roster.length, wavePlan(r.code, 3, r.started).roster.length * 2);
assert.deepEqual(game.rooms.get('OTHER').balance, DEFAULT_BALANCE);
assert.equal(other.snapshot.balanceRevision, 0);
const late = game.join({ code: 'BALANCE' });
assert.deepEqual(late.snapshot.balance, r.balance, 'late joiner gets effective settings');
change({ startingMoney: 50 });
const currentMoney = r.dollars;
assert.notEqual(currentMoney, 50, 'initial money is not credited on edit');
const oldEpoch = r.base.epoch;
s = call(a.id, 'reset', { epoch: oldEpoch });
assert.equal(s.dollars, 50);
assert.equal(s.balance.enemySpeed, 2);
assert.deepEqual(s.balanceOwner, [a.id]);
assert.throws(
  () => call(a.id, 'balance', { epoch: oldEpoch, revision: r.balanceRevision, values: {} }),
  /changé/,
);
game.disconnect('BALANCE', a.id);
const resumed = game.join({ code: 'BALANCE', resumeKey: a.resumeKey });
assert.ok(resumed.snapshot.balanceOwner.includes(resumed.id));
assert.doesNotThrow(() =>
  call(resumed.id, 'balance', {
    epoch: r.base.epoch,
    revision: r.balanceRevision,
    values: DEFAULT_BALANCE,
  }),
);
assert.deepEqual(r.balance, DEFAULT_BALANCE);
assert.equal(
  scaleRoster(
    {
      budget: 1,
      roster: Array.from({ length: 400 }, (_, id) => ({
        ...wavePlan('CAP', 1, now).roster[0],
        id,
      })),
    },
    { ...DEFAULT_BALANCE, population: 3 },
  ).roster.length,
  900,
);
const doubled = scaleRoster(wavePlan('COPIES', 1, now), {
  ...DEFAULT_BALANCE,
  population: 2,
}).roster;
assert.notEqual(
  doubled[0].spawn,
  doubled[1].spawn,
  'additional copies have distinct departure times',
);
const doubledFrame = swarmFrame(doubled, 10);
assert.notDeepEqual(
  doubledFrame[0].p,
  doubledFrame[1].p,
  'additional population must not be stacked invisibly',
);
// Real component handlers: preserve edits on polling, reject stale saves, retry errors.
class Element {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.map = new Map();
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    const values = new Set();
    this.classList = {
      add: (key) => values.add(key),
      remove: (key) => values.delete(key),
      contains: (key) => values.has(key),
    };
  }
  querySelector(key) {
    if (!this.map.has(key)) this.map.set(key, new Element(key));
    return this.map.get(key);
  }
  append(...children) {
    this.children.push(...children);
  }
  focus() {
    this.focused = true;
  }
}
let snapshot = game.snapshot(r),
  calls = 0,
  pending,
  fail,
  opened = 0,
  closed = 0,
  who = resumed.id;
const root = new Element();
const ui = new BalanceUI({
  root,
  document: { createElement: (tag) => new Element(tag) },
  snapshot: () => snapshot,
  player: () => who,
  command: (body) => {
    calls++;
    assert.equal(body.epoch, snapshot.base.epoch);
    return new Promise((yes, no) => {
      pending = yes;
      fail = no;
    });
  },
  accept: (value) => {
    snapshot = value;
    ui.render();
  },
  onOpen: () => opened++,
  onClose: () => closed++,
});
ui.open();
assert.equal(opened, 1);
assert.equal(ui.fields.size, Object.keys(BALANCE_FIELDS).length);
ui.fields.get('damage').value = '2';
ui.render();
assert.equal(ui.fields.get('damage').value, '2', 'polling must not overwrite edits');
let submitted = ui.submit();
assert.equal(calls, 1);
assert.equal(ui.save.disabled, true);
await ui.submit();
assert.equal(calls, 1, 'no double submission');
pending({
  ...snapshot,
  balanceRevision: snapshot.balanceRevision + 1,
  balance: { ...snapshot.balance, damage: 2 },
});
await submitted;
assert.equal(ui.save.disabled, false);
snapshot = { ...snapshot, balanceRevision: snapshot.balanceRevision + 1 };
ui.render();
assert.equal(ui.save.disabled, true, 'concurrent revision requires reload');
ui.reload.onclick();
assert.equal(ui.save.disabled, false);
ui.defaults.onclick();
assert.equal(Number(ui.fields.get('damage').value), 1);
submitted = ui.submit();
fail(Error('Réessayer'));
await submitted;
assert.equal(ui.status.textContent, 'Réessayer');
assert.equal(ui.save.disabled, false);
who = b.id;
ui.render();
assert.equal(ui.save.disabled, true);
assert.ok([...ui.fields.values()].every((input) => input.disabled));
ui.close();
assert.equal(closed, 1);
console.log(
  'Room balance: isolated settings, atomic validation, creator/resume, wave timing, continuous routes, HP/supplies ratios, combat/economy, reset, late joins and UI handlers.',
);
