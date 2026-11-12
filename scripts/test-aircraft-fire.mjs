import { nearestWeaponMuzzle } from '../src/muzzle.js';
import { TracerPool } from '../src/tracers.js';
import { GunSalvos, advanceAutomaticFire } from '../src/salvos.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { AircraftFire } from '../src/aircraft-fire.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const requests = [];
const timers = new Map();
let timerID = 0,
  scope = 'flight';
const schedule = (callback, delay) => {
  const id = ++timerID;
  timers.set(id, { callback, delay });
  return id;
};
const cancel = (id) => timers.delete(id);
const fire = new AircraftFire(
  (body) => {
    const request = deferred();
    requests.push({ ...request, body });
    return request.promise;
  },
  () => scope,
  // Frozen clock: a real millisecond tick made the 1000 ms retry read 999 ms.
  { session: 'test', schedule, cancel, limit: 128, now: () => 1_000_000 },
);
const supply = { ammo: { pilot: 1000 }, revision: 0 };
const reply = (request, ammo, revision) => ({
  vehicle: request.body.vehicle,
  seat: request.body.seat,
  shots: request.body.shots,
  ammo: { pilot: ammo },
  revision,
});
// No request, promise or timer completion is required to shoot or spend locally.
for (let i = 0; i < 4; i++) assert.equal(fire.fire('v', 'pilot', supply), true);
assert.equal(requests.length, 0);
assert.equal(timers.size, 1, 'one batched report, not one timer per bullet');
assert.equal([...timers.values()][0].delay, 50);
assert.equal(fire.available('v', 'pilot', supply), 996);
const firstFlush = fire.flush();
assert.equal(requests.length, 1);
assert.equal(requests[0].body.shots.length, 4);
assert.equal(new Set(requests[0].body.shots).size, 4);
// Continue at nominal cadence while HTTP has not replied.
for (let i = 0; i < 16; i++) assert.equal(fire.fire('v', 'pilot', supply), true);
assert.equal(requests.length, 1, 'slow HTTP does not create concurrent per-bullet requests');
requests[0].resolve(reply(requests[0], 996, 4));
await firstFlush;
assert.equal(fire.available('v', 'pilot', supply), 980);
const secondFlush = fire.flush();
const second = requests.at(-1);
assert.equal(second.body.shots.length, 16);
// Snapshot may already include that debit before the request's reply arrives.
assert.equal(fire.available('v', 'pilot', { ammo: { pilot: 980 }, revision: 20 }), 964);
second.resolve(reply(second, 980, 20));
await secondFlush;
assert.equal(fire.available('v', 'pilot', supply), 980, 'old snapshots cannot refund ammunition');

assert.equal(fire.fire('v', 'pilot', supply), true);
const uncertain = fire.flush();
const failed = requests.at(-1);
failed.reject(Error('network timeout after possible server commit'));
await uncertain;
assert.equal(fire.available('v', 'pilot', supply), 979);
assert.equal([...timers.values()][0].delay, 1000);
const retried = fire.flush();
assert.deepEqual(requests.at(-1).body.shots, failed.body.shots, 'retry identical round IDs');
requests.at(-1).resolve(reply(requests.at(-1), 979, 21));
await retried;
assert.equal(fire.available('v', 'pilot', supply), 979);

scope = null;
assert.equal(fire.fire('v', 'pilot', supply), false);
scope = 'new-post';
const lastSupply = { ammo: { tail: 1 }, revision: 30 };
assert.equal(fire.fire('bomber', 'tail', lastSupply), true);
assert.equal(fire.fire('bomber', 'tail', lastSupply), false, 'last round cannot be spent twice');
const lastFlush = fire.flush();
requests.at(-1).resolve({
  vehicle: 'bomber',
  seat: 'tail',
  shots: requests.at(-1).body.shots,
  ammo: { tail: 0 },
  revision: 31,
});
await lastFlush;
assert.equal(fire.available('bomber', 'tail', lastSupply), 0);

for (let i = 0; i < 128; i++) assert.equal(fire.fire('v', 'pilot', supply), true);
assert.equal(
  fire.fire('v', 'pilot', supply),
  false,
  'unknown debits stay bounded on a broken link',
);
const largeFlush = fire.flush();
assert.equal(requests.at(-1).body.shots.length, 32, 'server batch limit');
requests.at(-1).reject(Object.assign(Error('seat left'), { status: 409 }));
await largeFlush;
assert.equal(fire.available('v', 'pilot', supply), 0, 'definitive refusal stops prediction');

// Real client entry point with HTTP deliberately withheld.
const source = readFileSync('src/client.js', 'utf8');
const section = source.slice(
  source.indexOf('function bullet('),
  source.indexOf('function emitBullet('),
);
const pending = [],
  emitted = [],
  callbacks = new Map();
let timer = 0;
const context = vm.createContext({
  T,
  AircraftFire: class extends AircraftFire {
    constructor(request, scope, options) {
      super(request, scope, {
        ...options,
        schedule: (callback) => {
          callbacks.set(++timer, callback);
          return timer;
        },
        cancel: (id) => callbacks.delete(id),
      });
    }
  },
  globalThis: { crypto: { randomUUID: () => 'client-test' } },
  Date,
  Math,
  JSON,
  setTimeout: (callback) => {
    callbacks.set(++timer, callback);
    return timer;
  },
  clearTimeout: (id) => callbacks.delete(id),
  TracerPool,
  renderer: { isWebGLRenderer: true },
  GunSalvos,
  scene: new T.Scene(),
  joined: true,
  respawnAt: 0,
  deathPending: false,
  room: 'test',
  id: 'p',
  crewSeat: 'pilot',
  snap: { wave: 1, mission_started: 1, pilots: [{ id: 'p', life: 'alive', incarnation: 0 }] },
  myVehicle: {
    id: 'v',
    state: { hp: 100, v: [0, 0, 0] },
    supplies: { ammo: { pilot: 1000 }, revision: 0 },
  },
  vel: new T.Vector3(),
  nearestWeaponMuzzle,
  me: new T.Group(),
  hasAmmo: () => true,
  vehicleColor: () => '#abcdef',
  currentAmmoKey: () => 'pilot',
  api: (path, body) => {
    assert.equal(path, 'aircraft-fire');
    const request = deferred();
    pending.push({ ...request, body });
    return request.promise;
  },
  emitBullet: (...args) => emitted.push(args),
});
vm.runInContext(section, context);
for (let i = 0; i < 4; i++) context.bullet(new T.Vector3(), new T.Vector3(0, 0, -1), '', true);
assert.equal(emitted.length, 4, 'all projectiles appear before any HTTP response');
assert.equal(pending.length, 0);
callbacks.values().next().value();
assert.equal(pending.length, 1);
assert.equal(pending[0].body.shots.length, 4);
context.snap.wave++;
context.deathPending = true;
context.myVehicle = null;
pending[0].resolve({
  vehicle: 'v',
  seat: 'pilot',
  shots: pending[0].body.shots,
  ammo: { pilot: 996 },
  revision: 4,
});
await new Promise((resolve) => setImmediate(resolve));
assert.equal(emitted.length, 4, 'late reply after death/new wave cannot create duplicate shots');
assert.equal(context.myVehicle, null);

// A full nominal minute: 1,000 predicted rounds, only 250 background reports.
let serverAmmo = 1000,
  reports = 0;
const minute = new AircraftFire(
  async ({ vehicle, seat, shots }) => {
    reports++;
    serverAmmo -= shots.length;
    return { vehicle, seat, shots, ammo: { pilot: serverAmmo }, revision: reports };
  },
  () => 'flight',
  { session: 'minute', schedule: () => 1, cancel: () => {} },
);
for (let i = 0; i < 1000; i++) {
  assert.equal(minute.fire('v', 'pilot', supply), true);
  if (i % 4 === 3) await minute.flush();
}
assert.equal(reports, 250);
assert.equal(serverAmmo, 0);
assert.equal(minute.fire('v', 'pilot', supply), false);
assert.equal(minute.available('v', 'pilot', supply), 0);
console.log(
  'PASS: immediate client shots before HTTP, local depletion, batched reports, bounded slow links, retry IDs and late-reply safety',
);

// Previously, 128 local slots and a fixed 250 ms pause made sustained 100/s
// bursts stop under 200 ms RTT. Test the exact failure scenario and faster
// tuned rooms without a live network. Every 20th acknowledgement is lost
// *after* the server spent the rounds, to exercise idempotent retries.
async function sustainedFire({ latency, rate, seconds }) {
  let clock = 0,
    timerID = 0,
    requests = 0,
    serverAmmo = 1_000_000,
    blocked = 0;
  const timers = new Map(),
    seen = new Set();
  const schedule = (fn, delay) => {
    const id = ++timerID;
    timers.set(id, { at: clock + delay, fn });
    return id;
  };
  const cancel = (id) => timers.delete(id);
  const request = ({ vehicle, seat, shots }) =>
    new Promise((resolve, reject) => {
      const nth = ++requests;
      schedule(() => {
        for (const shot of shots)
          if (!seen.has(shot)) {
            seen.add(shot);
            serverAmmo--;
          }
        if (nth % 20 === 0) reject(Error('lost confirmation'));
        else resolve({ vehicle, seat, shots, ammo: { pilot: serverAmmo }, revision: seen.size });
      }, latency);
    });
  const gun = new AircraftFire(request, () => 'flight', {
    session: 'lag-test',
    schedule,
    cancel,
    now: () => clock,
  });
  const supply = { ammo: { pilot: 1_000_000 }, revision: -1 };
  async function advance(until) {
    while (true) {
      let next = null;
      for (const [id, timer] of timers)
        if (timer.at <= until && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break;
      timers.delete(next[0]);
      clock = next[1].at;
      next[1].fn();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    clock = until;
  }
  for (let i = 0; i < rate * seconds; i++) {
    await advance(((i + 1) * 1000) / rate);
    if (!gun.fire('v', 'pilot', supply)) blocked++;
  }
  await advance(seconds * 1000 + 4000);
  assert.equal(blocked, 0, 'a delayed confirmation must not interrupt a local burst');
  assert.equal(gun.queue.length, 0, 'all shot reports eventually settle');
  assert.equal(seen.size, rate * seconds, 'a lost reply must not debit twice');
  assert.equal(serverAmmo, 1_000_000 - rate * seconds);
}
for (const scenario of [
  { latency: 200, rate: 100, seconds: 30 },
  { latency: 200, rate: 500, seconds: 10 },
  { latency: 100, rate: 1000, seconds: 5 },
])
  await sustainedFire(scenario);

for (const fps of [20, 30, 60, 120]) {
  let cooldown = 0,
    shots = 0;
  for (let i = 0; i < fps * 30; i++) {
    const result = advanceAutomaticFire(cooldown, 1 / fps, 0.06, true);
    cooldown = result.cooldown;
    shots += result.shots;
  }
  assert.ok(Math.abs(shots - 500) <= 1, '60 ms cadence at ' + fps + ' FPS: ' + shots);
}
assert.equal(advanceAutomaticFire(0, 0.25, 0.001, true).shots, 8);
assert.equal(advanceAutomaticFire(0, 0.25, 0.001, false).shots, 0);
assert.equal(advanceAutomaticFire(0, 1, 0, true).shots, 0);
console.log(
  'PASS: uninterrupted sustained fire under simulated RTT/loss, bounded catch-up at 20–120 FPS',
);
