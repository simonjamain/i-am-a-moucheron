import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as T from '../vendor/three.module.min.js';
import { stepHeavy, heavyImpact } from '../src/heavy-sim.js';
import { HEAVY } from '../src/armament.js';
import { MAP } from '../src/scale.js';
import { baseWorld } from '../src/base.js';
import { airField } from '../src/air-current.js';
import { debugSwarmRoster, swarmFrame } from '../src/waves.js';
import { ROUTE_OBSTACLES } from '../src/route-obstacles.js';
import { howitzerMuzzle } from '../src/howitzer-geometry.js';
import { DEFAULT_BALANCE } from '../src/balance.js';

// Runs the client's real shooter code (heavyWorld, updateLocalHeavy,
// finishHeavy): the heavy gun's shell flies in the shooter's browser, hits the
// enemy it sees, predicts the kill and reports the impact to the server.
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
const code = source.slice(
  source.indexOf("// What this shooter's browser sees, for its own shells."),
  source.indexOf('// Neutral shell colours by weapon'),
);
let now = 1_000_000;
const roster = debugSwarmRoster(
  { rat: 1 },
  { room: 'CLIENT', wave: 1, started: now, now, balance: DEFAULT_BALANCE, firstId: 0, revision: 1 },
);
const groundDefense = { revision: 0, navigationRevision: 0, structures: [] };
now += 4000;
const target = swarmFrame(roster, 4, null, airField(groundDefense, now))[0].p;
const station = { kind: 'antitank', x: target[0] + MAP.metres(30), y: 0, z: target[2], hp: 180 };
const sent = [],
  fallen = [];
const context = {
  T,
  MAP,
  Date,
  performance,
  structuredClone,
  stepHeavy,
  heavyImpact,
  swarmFrame,
  airField,
  baseWorld,
  ROUTE_OBSTACLES,
  id: 'shooter',
  myVehicle: null,
  crewSeat: null,
  respawnAt: 0,
  baseArena: null,
  localKills: new Set(),
  localEnemyDamage: new Map(),
  localShots: new Map(),
  predictedReloads: new Map(),
  reloadNow: () => now,
  effectSeen: new Set(),
  groundMotion: { sample: () => () => undefined },
  serverClock: { now: () => now },
  currentRoster: () => roster,
  remoteMotion: (p) => p.state,
  weaponDirection: () => new T.Vector3(0, 0, -1),
  fallEnemy: (index) => fallen.push(index),
  action: (path, body) => sent.push({ path, body }),
  hitEffects: { burst() {} },
  combatEffects: { blast() {} },
  sound: { play() {} },
  camera: {},
  me: { position: new T.Vector3() },
  snap: {
    phase: 'combat',
    wave: 1,
    started: now - 4000,
    kills: [],
    vehicles: [],
    pilots: [{ id: 'shooter', life: 'alive', mode: 'turret', state: { turret: 0 } }],
    equipment: [station],
    groundDefense,
    balance: DEFAULT_BALANCE,
  },
};
vm.createContext(context);
vm.runInContext(code, context);
// The shell leaves the real muzzle, aimed at the rat the shooter sees.
const muzzle = howitzerMuzzle(station, [-1, 0, 0]);
const aim = target.map((v, i) => v - muzzle[i]),
  length = Math.hypot(...aim),
  dir = aim.map((v) => v / length);
context.localShots.set('client-shot', {
  shot: 'client-shot',
  weapon: 'antitank',
  vehicle: null,
  station: 0,
  shooter: 'shooter',
  p: howitzerMuzzle(station, dir),
  v: dir.map((v) => v * HEAVY.antitank.speed),
  age: 0,
  at: now,
  updated: now,
  wave: 1,
  radiusFactor: 1,
  bonus: 1,
});
// One frame later, the shell is still in flight.
now += 1;
vm.runInContext('updateLocalHeavy()', context);
assert.equal(sent.length, 0, 'still flying after 1 ms');
now += 200;
vm.runInContext('updateLocalHeavy()', context);
assert.equal(sent.length, 1, 'one report when it hits');
const report = sent[0].body;
assert.equal(sent[0].path, 'heavy-impact');
assert.equal(report.shot, 'client-shot');
assert.equal(report.kind, 'blast');
assert.deepEqual(
  report.enemies.map(([index]) => index),
  [0],
  'the rat the shooter sees is hit',
);
assert.equal(report.enemies[0][1], HEAVY.antitank.damage, 'full charge on the struck insect');
assert.equal(context.localShots.size, 0, 'the shell is gone');
assert.ok(context.effectSeen.has('client-shot'), 'shown at once, not again from the server');
assert.equal(context.localEnemyDamage.get(0), HEAVY.antitank.damage, 'damage predicted locally');
// A missile whose helicopter is gone ends without blast: a fizzle is reported.
context.localShots.set('lost', {
  shot: 'lost',
  weapon: 'missile',
  vehicle: 'destroyed-helicopter',
  shooter: 'shooter',
  p: [0, 5, 0],
  v: [0, 0, -1],
  age: 0,
  at: now,
  updated: now,
  wave: 1,
  radiusFactor: 1,
  bonus: 1,
});
now += 16;
vm.runInContext('updateLocalHeavy()', context);
// Objects built in the VM have another realm's prototypes: compare values.
assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))), {
  path: 'heavy-impact',
  body: { shot: 'lost', fizzle: true },
});
assert.equal(context.localShots.size, 0);
console.log(
  'Client heavy shell: real muzzle, hit seen by the shooter, local prediction, report and fizzle.',
);
