import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { localDB } from './local-db.mjs';
import { CONTRACTS, ContractBook } from '../src/contracts.js';
import { RewardQueue } from '../src/rewards.js';
import { synthesize } from '../src/audio.js';
const DB = localDB();
let now = Date.now();
const realNow = Date.now;
Date.now = () => now;
async function api(path, data, status = 200) {
  const r = await worker.fetch(
    new Request('https://test/api/' + path, { method: 'POST', body: JSON.stringify(data) }),
    { DB },
  );
  const body = await r.json();
  assert.equal(r.status, status, JSON.stringify(body));
  return body;
}
const a = await api('join', { name: 'A', code: 'SEATTEST' }),
  b = await api('join', { name: 'B', code: 'SEATTEST' }),
  c = await api('join', { name: 'C', code: 'SEATTEST' });
const vehicle = a.snapshot.vehicles.find((v) => v.type === 'bomber');
async function assign(p, seat) {
  await DB.prepare('DELETE FROM vehicle_seats WHERE pilot=?').bind(p.id).run();
  await DB.prepare('INSERT INTO vehicle_seats(room,vehicle,seat,pilot) VALUES(?,?,?,?)')
    .bind('SEATTEST', vehicle.id, seat, p.id)
    .run();
  await DB.prepare('UPDATE pilots SET mode=?,vehicle_id=?,seat=? WHERE id=?')
    .bind(seat === 'pilot' ? 'flight' : 'crew', vehicle.id, seat, p.id)
    .run();
}
await assign(a, 'pilot');
await assign(b, 'tail');
let s = await api('seat-request', { id: a.id, seat: 'dorsal' });
let request = s.seatRequests.find((r) => r.requester === a.id);
assert.equal(s.pilots.find((p) => p.id === a.id).seat, 'pilot');
s = await api('seat-sign', { id: a.id, request: request.id, signature: true });
assert.equal(s.pilots.find((p) => p.id === a.id).seat, 'dorsal');
assert.ok(!s.vehicles.find((v) => v.id === vehicle.id).seats.some((x) => x.seat === 'pilot'));
s = await api('seat-request', { id: a.id, seat: 'pilot' });
request = s.seatRequests.find((r) => r.requester === a.id);
s = await api('seat-sign', { id: a.id, request: request.id, signature: true });
assert.equal(s.pilots.find((p) => p.id === a.id).mode, 'flight');
// An airborne move never resets the aircraft pose.
const pose = { ...vehicle.state, p: [0, 1.8, 0], v: [0, 0, -0.1], landed: false };
await api('sync', { id: a.id, mode: 'flight', state: pose });
s = await api('seat-request', { id: a.id, seat: 'tail' });
request = s.seatRequests.find((r) => r.requester === a.id);
await api('seat-sign', { id: b.id, request: request.id, signature: true }, 409);
s = await api('seat-sign', { id: a.id, request: request.id, signature: true });
assert.equal(s.pilots.find((p) => p.id === a.id).seat, 'pilot');
s = await api('seat-sign', { id: b.id, request: request.id, signature: true });
assert.equal(s.pilots.find((p) => p.id === a.id).seat, 'tail');
assert.equal(s.pilots.find((p) => p.id === b.id).seat, 'pilot');
assert.deepEqual(s.vehicles.find((v) => v.id === vehicle.id).state.p, pose.p);
// Refusal keeps both rights unchanged.
s = await api('seat-request', { id: a.id, seat: 'pilot' });
request = s.seatRequests.find((r) => r.requester === a.id);
await api('seat-sign', { id: a.id, request: request.id, signature: true });
s = await api('seat-reject', { id: b.id, request: request.id });
assert.equal(s.pilots.find((p) => p.id === a.id).seat, 'tail');
// Two signatures competing for a free seat: precisely one claimant wins.
await assign(c, 'dorsal');
await DB.prepare('DELETE FROM vehicle_seats WHERE pilot=?').bind(b.id).run();
await DB.prepare("UPDATE pilots SET mode='foot',vehicle_id=NULL,seat=NULL WHERE id=?")
  .bind(b.id)
  .run();
let x = await api('seat-request', { id: a.id, seat: 'pilot' }),
  y = await api('seat-request', { id: c.id, seat: 'pilot' });
const ra = x.seatRequests.find((r) => r.requester === a.id),
  rc = y.seatRequests.find((r) => r.requester === c.id);
const outcomes = await Promise.allSettled([
  api('seat-sign', { id: a.id, request: ra.id, signature: true }),
  api('seat-sign', { id: c.id, request: rc.id, signature: true }),
]);
assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
const seats = (
  await DB.prepare('SELECT seat,pilot FROM vehicle_seats WHERE vehicle=?').bind(vehicle.id).all()
).results;
assert.equal(new Set(seats.map((x) => x.seat)).size, seats.length);
// Disconnect cancels an offered exchange without moving either player.
const winner = seats.find((x) => x.seat === 'pilot').pilot,
  other = winner === a.id ? c.id : a.id,
  otherSeat = seats.find((x) => x.pilot === other).seat;
s = await api('seat-request', { id: winner, seat: otherSeat });
request = s.seatRequests.find((r) => r.requester === winner);
await api('seat-sign', { id: winner, request: request.id, signature: true });
await DB.prepare('UPDATE pilots SET seen=? WHERE id=?')
  .bind(now - 13000, other)
  .run();
s = await api('sync', { id: winner, state: pose });
assert.ok(!s.seatRequests.some((r) => r.id === request.id));
Date.now = realNow;
let count = 0;
const rewards = new RewardQueue(() => count++);
rewards.observe(5);
rewards.tick(0);
assert.equal(count, 0);
rewards.observe(8);
rewards.observe(8);
for (let t = 0; t < 1000; t += 40) rewards.tick(t);
assert.equal(count, 3);
rewards.observe(0, true);
rewards.tick(2000);
assert.equal(count, 3);
assert.ok(synthesize('dollar').some((v) => v !== 0));
let docs = 0;
const book = new ContractBook(() => 0);
for (const [key, forms] of Object.entries(CONTRACTS))
  for (const [i, variants] of forms.entries()) {
    docs++;
    assert.equal(variants.length, 10);
    assert.equal(new Set(variants.map((v) => v.text)).size, 10);
    const first = book.get(key, i, 'first');
    assert.strictEqual(book.get(key, i, 'first'), first);
    assert.notEqual(book.get(key, i, 'second').text, first.text);
    if (key.startsWith('super:'))
      assert.ok(
        first.text.length >
          3 * Math.max(...CONTRACTS['purgatory:soul'].flat().map((v) => v.text.length)),
      );
  }
assert.equal(docs, 60);
console.log(
  'PASS: free/airborne seat changes, ordered two-party atomic exchange, refusal, competing claims, disconnect cancellation, reward sounds and 600 contract variants.',
);
const T = await import('../vendor/three.module.min.js');
const { stepVacantAircraft } = await import('../src/vacant-flight.js');
const { VEHICLES } = await import('../src/fleet.js');
const { MAP } = await import('../src/scale.js');
const vacant = {
  p: [0, 2, 0],
  q: [0, 0, 0, 1],
  v: [0, 0, -MAP.metres(30)],
  hp: 100,
  engine: 1,
  wing: 1,
  landed: false,
  gas: 0.65,
};
for (let i = 0; i < 120; i++) stepVacantAircraft(T, vacant, VEHICLES.bomber, [], 1 / 120);
assert.ok(vacant.p[2] < -0.05);
assert.ok(vacant.p[1] < 2);
const host = (
  await DB.prepare("SELECT id FROM pilots WHERE room='SEATTEST' AND seen>? ORDER BY id LIMIT 1")
    .bind(now - 12000)
    .first()
).id;
await DB.prepare("DELETE FROM vehicle_seats WHERE vehicle=? AND seat='pilot'")
  .bind(vehicle.id)
  .run();
await DB.prepare("UPDATE pilots SET mode='crew',seat='tail' WHERE id=?").bind(winner).run();
await api('sync', { id: host, state: pose, vacant: [{ id: vehicle.id, state: vacant }] });
let hull = await DB.prepare('SELECT state FROM vehicles WHERE id=?').bind(vehicle.id).first();
assert.deepEqual(JSON.parse(hull.state).p, vacant.p);
await assign({ id: winner }, 'pilot');
const before = JSON.parse(hull.state).p;
await api('sync', {
  id: host,
  state: pose,
  vacant: [{ id: vehicle.id, state: { ...vacant, p: [2, 2, 2] } }],
});
hull = await DB.prepare('SELECT state FROM vehicles WHERE id=?').bind(vehicle.id).first();
assert.notDeepEqual(JSON.parse(hull.state).p, [2, 2, 2]);
console.log(
  'PASS: vacant cockpit physics and relay authority; an occupied cockpit rejects vacant-state reports.',
);
