// Exercise the shipped launch gate: holding fire during reload must create
// neither a projectile nor its firing sound, then resume at the real deadline.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { HEAVY, heavyInterval } from '../src/armament.js';
import { heavyReadyAt, heavyLane } from '../src/reload-hud.js';
const source = readFileSync('src/client.js', 'utf8');
const code = source.slice(
  source.indexOf('async function fireHeavy('),
  source.indexOf("// What this shooter's browser sees"),
);
let now = 10000;
const vehicle = {
  id: 'hind',
  type: 'helicopter',
  nextMissileAt: 11000,
  state: { p: [0, 1, 0], q: [0, 0, 0, 1], v: [0, 0, 0] },
  supplies: { ammo: { missile: 10, rocket: 30 } },
};
const sounds = [],
  launches = [];
const predictedReloads = new Map();
const c = vm.createContext({
  joined: true,
  respawnAt: 0,
  myVehicle: vehicle,
  controlFocus: { active: true },
  canCapture: () => true,
  crewSeat: 'copilot',
  keys: {},
  reloadNow: () => now,
  HEAVY,
  heavyInterval,
  activeMissile: () => null,
  nextHeavyTime: (v, w) =>
    heavyReadyAt(v, w, 1, predictedReloads.get(v.id + ':' + heavyLane(w)) || 0),
  predictedReloads,
  reloadKey: (v, w) => v.id + ':' + heavyLane(w),
  localMotion: () => ({}),
  id: 'p',
  shotSequence: 0,
  weaponDirection: () => new T.Vector3(0, 0, 1),
  snap: { wave: 1, pilots: [{ id: 'p', occupation: 1 }] },
  serverClock: { now: () => now },
  performance: { now: () => now },
  rocketSides: new Map(),
  launchVehicle: () => vehicle,
  createOrdnance: (v) => v,
  launchLocal: (v) => (launches.push(v), v),
  sound: { play: (...args) => sounds.push(args) },
  me: { position: new T.Vector3() },
  api: async () => ({}),
  accept: () => {},
  availableShell: () => null,
  localShots: new Map(),
  notify: () => {},
  selectedShell: 'he',
  clockOffset: 0,
});
vm.runInContext(code, c);
for (; now < 11000; now += 10) await vm.runInContext("fireHeavy('missile')", c);
assert.equal(sounds.length, 0);
assert.equal(launches.length, 0);
await vm.runInContext("fireHeavy('missile')", c);
assert.equal(sounds.length, 1);
assert.equal(launches.length, 1);
// Its two-second post-impact timer belongs only to the missile, not rockets.
predictedReloads.set('hind:missile', now + 2000);
c.crewSeat = 'pilot';
await vm.runInContext("fireHeavy('rocket')", c);
assert.equal(launches.length, 2, 'rocket remains usable during missile reload');
for (let i = 0; i < 29; i++) {
  now += 10;
  await vm.runInContext("fireHeavy('rocket')", c);
}
assert.equal(sounds.length, 2, 'held trigger stays silent throughout rocket reload');
now += 10;
await vm.runInContext("fireHeavy('rocket')", c);
assert.equal(sounds.length, 3, 'sound resumes with next launch');
console.log(
  'Hind launch/sound gate: reload silent, cadence resumes, missile/rocket timers independent across seats',
);
