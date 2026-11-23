// Statistiques de puissance pratique des équipements (docs/stats.md).
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from '../server/game.js';
import { StatsLedger, MIN_HUMAN_MINUTES, FAIR_BAND } from '../server/stats.ts';
import { createGameServer } from '../server/index.js';
import { advancePaidService } from '../src/paid-service.ts';
import { fullAmmo } from '../src/logistics.ts';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// --- Attribution: share of the enemy's power, no last-hit bias, no overkill.
let now = 100000;
const game = new Game({ now: () => now, stats: new StatsLedger({ version: 7 }) });
const a = game.join({ code: 'STATS', name: 'Alpha' });
const room = game.rooms.get('STATS');
const call = (path, body = {}) => game.command('STATS', a.id, path, body);
call('start');
now += 60000;
for (const p of room.pilots.values()) p.seen = now;
call('sync', { state: a.state, mode: 'foot' });
assert.equal(room.phase, 'combat');
// A fixed light flak operator: seat "operator" of the equipment kind.
room.equipment.push({ kind: 'dca', x: 0, y: 0, z: 0, ammo: 100, slot: 0 });
const pilot = room.pilots.get(a.id);
pilot.mode = 'turret';
pilot.state.turret = 0;
const roster = game.plan(room).roster;
const target = roster[0];
const ledger = game.stats;
const cell = () => ledger.acc.get(room).seats.get('dca|operator');
call('hit', { wave: 1, enemy: 0, amount: 75, shot: 'w1' });
near(cell().power, (75 / target.hp) * target.power);
call('hit', { wave: 1, enemy: 0, amount: 75, shot: 'w2' });
call('hit', { wave: 1, enemy: 0, amount: 75, shot: 'w3' });
assert.ok(room.kills.has(0));
near(cell().power, target.power, 1e-9); // whole power once, overkill excluded
call('hit', { wave: 1, enemy: 0, amount: 75, shot: 'w4' }); // already dead
near(cell().power, target.power, 1e-9);
near(cell().air + cell().ground, target.power);
assert.ok(cell().weapons.rapid === undefined && cell().weapons.mg > 0, 'weapon kept apart');

// Debug mode measures nothing.
const debug = game.join({ code: 'STATSDBG', name: 'Debug' });
const lab = game.rooms.get('STATSDBG');
lab.lab = { enabled: true };
game.creditEnemy(
  lab,
  { item: 'fighter', seat: 'pilot', weapon: 'mg' },
  0,
  { hp: 100, power: 1 },
  100,
);
assert.equal(ledger.acc.get(lab)?.seats.size ?? 0, 0, 'lab rooms are not measured');
assert.ok(debug.id);

// --- Occupancy: seats are time-weighted, the vehicle counts once.
const bomber = game.createVehicle(room, 'medbomber', 'purchase');
const second = game.join({ code: 'STATS', name: 'Bravo' });
const crew = [
  [a.id, 'pilot'],
  [second.id, 'tail'],
];
for (const [id, seat] of crew) {
  const p = room.pilots.get(id);
  Object.assign(p, { mode: 'crew', vehicle_id: bomber.id, seat });
  bomber.seats.set(seat, id);
  p.seen = now;
}
const before = ledger.acc.get(room).items.get('medbomber')?.vehicleSeconds ?? 0;
for (let i = 0; i < 10; i++) {
  now += 1000;
  for (const p of room.pilots.values()) p.seen = now;
  game.sampleStats(room, now);
}
const items = ledger.acc.get(room).items.get('medbomber');
near(items.vehicleSeconds - before, 10, 1e-6);
near(ledger.acc.get(room).seats.get('medbomber|pilot').seconds, 10, 1e-6);
near(ledger.acc.get(room).seats.get('medbomber|tail').seconds, 10, 1e-6);
assert.equal(items.seats, 4);
// A pause between requests never counts as presence beyond two seconds.
now += 60000;
for (const p of room.pilots.values()) p.seen = now;
game.sampleStats(room, now);
near(ledger.acc.get(room).seats.get('medbomber|tail').seconds, 12, 1e-6);

// --- Report on synthetic samples: index, occupancy, fair price.
const synthetic = new StatsLedger({ version: 9 });
const mine = synthetic.data['9'] ?? (synthetic.data['9'] = { seats: [], items: [], waves: [] });
const seat = (item, seatName, power, seconds, extra = {}) => ({
  item,
  seat: seatName,
  power,
  air: power,
  ground: 0,
  seconds,
  weapons: { mg: power },
  n: 4,
  wave: 5,
  ...extra,
});
for (let i = 0; i < 4; i++) {
  mine.seats.push(seat('fighter', 'pilot', 20, 180)); // 6.67 per minute: the baseline
  mine.seats.push(seat('medbomber', 'tail', 10, 180)); // half of it
  mine.seats.push(seat('spitfire', 'pilot', 80, 180)); // four times the baseline
  mine.seats.push(seat('helicopter', 'pilot', 30, 180));
  mine.seats.push(seat('stuka', 'pilot', 0.1, 5)); // far too little data
  const base = {
    vehicleSeconds: 180,
    seats: 1,
    bought: 0,
    boughtDollars: 0,
    serviceDollars: 1,
    lost: 0,
    n: 4,
    wave: 5,
  };
  mine.items.push({ ...base, item: 'fighter' });
  mine.items.push({
    ...base,
    item: 'medbomber',
    seats: 4,
    vehicleSeconds: 180,
    bought: 1,
    boughtDollars: 15,
    serviceDollars: 3,
  });
  mine.items.push({ ...base, item: 'spitfire', bought: 1, boughtDollars: 75, serviceDollars: 5 });
  mine.items.push({ ...base, item: 'helicopter', bought: 1, boughtDollars: 50, serviceDollars: 5 });
}
mine.waves.push({ wave: 5, n: 4, power: 100, killed: 80, leaked: 20, lost: false });
const report = synthetic.report({ version: 9 });
const row = (item) => report.rows.find((r) => r.item === item);
near(row('fighter').index, 1);
near(row('medbomber').index, 0.5);
near(row('spitfire').index, 4);
assert.equal(row('stuka').index, null, 'not enough data: no index');
assert.ok(row('fighter').humanMinutes >= MIN_HUMAN_MINUTES);
const item = (name) => report.items.find((i) => i.item === name);
// Two seats of four are held over three minutes: 1 seat-minute out of 4.
near(item('medbomber').occupancy, 0.25);
assert.equal(item('fighter').status, 'gratuit');
assert.equal(item('stuka').status, 'insuffisant');
// Per dollar: medbomber 40/72, helicopter 120/220, spitfire 320/320. The median is the
// medbomber's: the spitfire is a bargain, the others are aligned.
assert.equal(item('spitfire').status, 'sous-payé');
assert.ok(item('spitfire').fairRatio > 1 + FAIR_BAND);
assert.equal(item('medbomber').status, 'aligné');
assert.equal(item('helicopter').status, 'aligné');
near(item('spitfire').fairPrice, item('spitfire').price * item('spitfire').fairRatio, 0.1);
assert.equal(report.waves.count, 1);
assert.equal(synthetic.report({ version: 9, n: '7-999' }).rows.length, 0, 'filter by player count');
assert.equal(synthetic.report({ version: 9, wave: '1-4' }).rows.length, 0, 'filter by wave');

// --- Persistence round trip, without ever blocking the game.
const folder = mkdtempSync(join(tmpdir(), 'stats-'));
const file = join(folder, 'nested', 'stats.json');
const saved = new StatsLedger({ version: 3, file });
saved.flush(room, { wave: 1, n: 1, power: 5, killed: 5, leaked: 0, lost: false });
saved.save(true);
assert.ok(existsSync(file));
assert.equal(new StatsLedger({ version: 3, file }).report().waves.count, 1);
assert.equal(
  new StatsLedger({ version: 3, file: join(folder, 'missing.json') }).report().waves.count,
  0,
);
rmSync(folder, { recursive: true, force: true });

// --- Paid service reports what each kind of equipment cost.
const fighter = {
  id: 'f',
  type: 'fighter',
  state: { p: [0, 0.03, 0], landed: false, hp: 50, engine: 1, wing: 1, v: [2, 0, 0] },
  supplies: {
    fuel: 0,
    ammo: Object.fromEntries(Object.keys(fullAmmo('fighter')).map((k) => [k, 0])),
    revision: 0,
  },
};
const service = advancePaidService([fighter], [{ kind: 'refuel', x: 0, y: 0, z: 0 }], 50, {}, 5);
near(service.spentBy.fighter, service.spent);

// --- The page and its data.
const app = createGameServer({
  game,
  statsToken: 'secret',
  muxPort: 45020,
  bindAddress: '127.0.0.1',
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + app.server.address().port;
try {
  assert.equal((await fetch(origin + '/stats')).status, 401, 'token required when configured');
  assert.equal((await fetch(origin + '/stats.json')).status, 401);
  const page = await fetch(origin + '/stats?token=secret');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Statistiques des équipements/);
  const data = await fetch(origin + '/stats.json?n=2-3&wave=1-4', {
    headers: { authorization: 'Bearer secret' },
  });
  assert.equal(data.status, 200);
  const body = await data.json();
  assert.equal(body.filter.n, '2-3');
  assert.ok(Array.isArray(body.rows) && Array.isArray(body.items));
} finally {
  await app.close();
}
const open = createGameServer({ muxPort: 45021, bindAddress: '127.0.0.1' });
await new Promise((resolve) => open.server.listen(0, '127.0.0.1', resolve));
try {
  assert.equal(
    (await fetch('http://127.0.0.1:' + open.server.address().port + '/stats.json')).status,
    200,
  );
} finally {
  await open.close();
}
console.log(
  'PASS: stats — share of power without overkill, seat occupancy, index and fair price, filters, persistence, service costs, /stats page and token.',
);
process.exit(0);
