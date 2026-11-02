import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { DEFAULT_BALANCE, BALANCE_FIELDS, validateBalance, scaleRoster } from '../src/balance.js';
import { BalanceUI } from '../src/balance-ui.js';
import { wavePlan, swarmFrame, ENEMY_TYPES } from '../src/waves.js';
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
for (const key of Object.keys(BALANCE_FIELDS)) {
  assert.doesNotThrow(
    () => validateBalance({ [key]: 10000 }),
    key + ' has no gameplay upper limit',
  );
  assert.ok(!Object.hasOwn(BALANCE_FIELDS[key], 'max'));
}

assert.deepEqual(a.snapshot.balanceOwner, [a.id]);
assert.ok(
  !JSON.stringify(a.snapshot).includes(a.resumeKey),
  'owner secret never appears in snapshots',
);
assert.doesNotThrow(() =>
  call(b.id, 'balance', {
    epoch: r.base.epoch,
    revision: r.balanceRevision,
    values: { damage: 1 },
  }),
);
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
assert.equal(s.total, wavePlan(r.code, 1, r.started).roster.length);
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
assert.equal(r.plan.roster.length, beforeRoster.length, 'composition is frozen until next wave');
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
  1200,
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
const unlimitedGame = new Game({ now: () => now });
const unlimited = unlimitedGame.join({ code: 'UNLIMITED' });
const unlimitedRoom = unlimitedGame.rooms.get('UNLIMITED');
const unrestricted = unlimitedGame.command('UNLIMITED', unlimited.id, 'balance', {
  epoch: unlimitedRoom.base.epoch,
  revision: 0,
  values: {
    population: 200,
    progression: 10,
    damage: 100,
    fireRate: 10,
    enemySpeed: 10,
    enemyHP: 100,
    ammo: 10,
    fuel: 10,
    prices: 100,
    rewards: 100,
    startingMoney: 100000,
    initialDelay: 600,
    pause: 600,
  },
});
assert.equal(unrestricted.balance.damage, 100, 'server accepts values above the former bounds');
unlimitedGame.startWave(unlimitedRoom);
const unlimitedTotal = unlimitedGame.snapshot(unlimitedRoom).total;
assert.equal(
  unlimitedTotal,
  wavePlan(unlimitedRoom.code, 1, unlimitedRoom.started).roster.length * 200,
  'the unlimited room uses its own seeded composition',
);
assert.ok(unlimitedTotal > 900, 'actual wave exceeds former 900-enemy ceiling');
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
    if (calls === 1) assert.equal(body.values.damage, 100, 'form submits above former ceiling');
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
assert.ok(
  [...ui.fields.values()].every((input) => !input.max),
  'inputs have no max attribute',
);
ui.fields.get('damage').value = '100';
ui.render();
assert.equal(ui.fields.get('damage').value, '100', 'polling must not overwrite edits');
let submitted = ui.submit();
assert.equal(calls, 1);
assert.equal(ui.save.disabled, true);
await ui.submit();
assert.equal(calls, 1, 'no double submission');
pending({
  ...snapshot,
  balanceRevision: snapshot.balanceRevision + 1,
  balance: { ...snapshot.balance, damage: 100 },
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
assert.equal(ui.save.disabled, false, 'guests may now edit balance');
assert.ok([...ui.fields.values()].every((input) => !input.disabled));
ui.close();
assert.equal(closed, 1);
console.log(
  'Room balance: isolated settings, atomic validation, creator/resume, wave timing, continuous routes, HP/supplies ratios, combat/economy, reset, late joins and UI handlers.',
);


// Cooperative debug tool: every connected player can spawn exact counts.
const swarmGame = new Game({ now: () => now });
const lead = swarmGame.join({ code: 'SWARMDBG', name: 'Alpha' });
const guest = swarmGame.join({ code: 'SWARMDBG', name: 'Bravo' });
const swarmRoom = swarmGame.rooms.get('SWARMDBG');
const spawn = (id, counts, epoch = swarmRoom.base.epoch) =>
  swarmGame.command('SWARMDBG', id, 'debug-spawn', { epoch, counts });
const initialEpoch = swarmRoom.base.epoch;
const beforeInvalid = swarmRoom.wave;
for (const counts of [
  null,
  [],
  {},
  { ant: -1 },
  { midge: 0 },
  { midge: 1.5 },
  { midge: '10' },
  { roach: 5001 },
  { unknown: 1 },
]) {
  assert.throws(() => spawn(guest.id, counts), /invalide|Maximum|Renseignez/);
  assert.equal(swarmRoom.wave, beforeInvalid, 'invalid input must not start a debug wave');
}
assert.throws(() => spawn(guest.id, { ant: 1 }, 'stale'), /changé/);
const debugStart = spawn(guest.id, { ant: 2, midge: 13, roach: 1 });
assert.equal(debugStart.phase, 'combat');
assert.equal(debugStart.wave, 1);
assert.equal(debugStart.total, 16, 'midge counts are exact, not ×5');
assert.equal(debugStart.rosterRevision, 1);
assert.deepEqual(
  debugStart.roster.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {}),
  { ant: 2, midge: 13, roach: 1 },
);
assert.ok(debugStart.roster.every((e, i) => e.id === i));
assert.ok(debugStart.roster.every((e) => e.spawn >= 0 && e.duration > e.entryHold));
const existing = structuredClone(debugStart.roster);
swarmGame.command('SWARMDBG', lead.id, 'hit', {
  wave: swarmRoom.wave,
  enemy: 0,
  amount: 25,
  shot: 'debug-hit',
});
const damageBeforeSpawn = swarmRoom.enemyDamage[0];
const more = spawn(lead.id, { dart: 3, brute: 2 });
assert.equal(more.total, 21);
assert.equal(more.rosterRevision, 2);
assert.deepEqual(more.roster.slice(0, 16), existing);
assert.equal(swarmRoom.enemyDamage[0], damageBeforeSpawn);
assert.deepEqual(more.roster.slice(16).map((e) => e.id), [16, 17, 18, 19, 20]);
const guestSnapshot = swarmGame.command('SWARMDBG', guest.id, 'sync', {
  mode: 'foot',
  state: swarmRoom.pilots.get(guest.id).state,
});
assert.equal(guestSnapshot.total, 21);
assert.equal(guestSnapshot.rosterRevision, 2);
const unrelated = swarmGame.join({ code: 'DIFFERENT' });
assert.notEqual(unrelated.snapshot.total, 21, 'debug swarms are isolated per room');
const lateGuest = swarmGame.join({ code: 'SWARMDBG', name: 'Late' });
assert.equal(lateGuest.snapshot.total, 21);
assert.throws(() => spawn(lateGuest.id, { midge: 5001 }), /Maximum/);
const debugVersion = swarmRoom.rosterRevision;
assert.throws(() => spawn(guest.id, { ant: -1 }), /invalide/);
assert.equal(swarmRoom.rosterRevision, debugVersion);
const testAfterReset = swarmGame.command('SWARMDBG', lead.id, 'reset', {
  epoch: initialEpoch,
});
assert.equal(testAfterReset.wave, 0);
assert.equal(testAfterReset.rosterRevision, 0);
assert.throws(() => spawn(guest.id, { ant: 1 }, initialEpoch), /changé/);
const afterReset = spawn(guest.id, { guard: 2 });
assert.equal(afterReset.total, 2, 'guest may restart debug after reset');
for (const enemy of swarmRoom.plan.roster) swarmRoom.kills.add(enemy.id);
swarmGame.command('SWARMDBG', guest.id, 'sync', {
  mode: 'foot',
  state: swarmRoom.pilots.get(guest.id).state,
});
assert.equal(swarmRoom.phase, 'prep');
const debugAgain = spawn(lead.id, { midge: 1 });
assert.equal(debugAgain.total, 1, 'prep creates a clean debug-only wave');
assert.equal(debugAgain.wave, 2);
assert.equal(debugAgain.roster[0].id, 0);

// True UI handlers: all species, validation, pending sends and retry.
const rootSpawn = new Element();
let latestSpawn = debugAgain;
let sendCount = 0;
let resolveSpawn;
const uiSpawn = new BalanceUI({
  root: rootSpawn,
  document: { createElement: (tag) => new Element(tag) },
  snapshot: () => latestSpawn,
  command: async () => latestSpawn,
  spawnCommand: (body) => {
    sendCount++;
    assert.deepEqual(body.counts, {
      ant: 0,
      roach: 0,
      midge: 24,
      dart: 0,
      guard: 0,
      brute: 1,
    });
    return new Promise((yes) => (resolveSpawn = yes));
  },
  accept: (s) => (latestSpawn = s),
  onOpen() {},
  onClose() {},
});
uiSpawn.open();
assert.equal(uiSpawn.spawnFields.size, Object.keys(ENEMY_TYPES).length);
uiSpawn.spawnFields.get('midge').value = '2.5';
await uiSpawn.submitSpawn();
assert.equal(sendCount, 0);
assert.match(uiSpawn.spawnStatus.textContent, /invalide/);
uiSpawn.spawnFields.get('midge').value = '24';
uiSpawn.spawnFields.get('brute').value = '1';
const sending = uiSpawn.submitSpawn();
assert.equal(uiSpawn.spawnSend.disabled, true);
await uiSpawn.submitSpawn();
assert.equal(sendCount, 1, 'no double debug spawn');
resolveSpawn({ ...latestSpawn, rosterRevision: latestSpawn.rosterRevision + 1 });
await sending;
assert.ok([...uiSpawn.spawnFields.values()].every((input) => input.value === '0'));
assert.equal(uiSpawn.spawnSend.disabled, false);
uiSpawn.close();
console.log('PASS: every-player room balance and debug spawn, exact species counts, epochs, UI and live roster.');

if (process.env.GITHUB_ACTIONS) {
  const { execFileSync } = await import('node:child_process');
  const files = [
    'src/waves.js',
    'server/game.js',
    'server/session.js',
    'src/balance-ui.js',
    'src/client.js',
    'src/index.html',
    'scripts/test-room-balance.mjs',
    'scripts/test-roster-sync.mjs',
    'scripts/test-udp-native.mjs',
    'scripts/benchmark-snapshot-50.mjs',
    'docs/room-balance.md',
    'docs/gameplay.md',
    'README.md',
  ];
  execFileSync('npx', ['prettier', '--write', ...files], { stdio: 'ignore' });
  const diff = execFileSync('git', ['diff', '--', ...files], { encoding: 'utf8' });
  console.log('FORMAT_DIAG_START\n' + diff + '\nFORMAT_DIAG_END');
}
