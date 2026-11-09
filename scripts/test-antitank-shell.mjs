// Issue #113 follow-up: the heavy gun fires a server shell like the tank cannon
// (gravity, drag, solids, direct hits, blast), faster, harder-hitting and with a
// smaller blast; a horizontal shot leaves the muzzle instead of exploding on it.
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { resolveHeavy } from './heavy-resolver.mjs';
import { HEAVY, heavyDamage } from '../src/armament.js';
import { FORTIFICATIONS } from '../src/ground-fortifications.js';
import { howitzerMuzzle } from '../src/howitzer-geometry.js';
import { debugSwarmRoster, swarmFrame } from '../src/waves.js';
import { MAP } from '../src/scale.js';

const shell = HEAVY.antitank;
assert.ok(shell.speed > HEAVY.he.speed && shell.speed > HEAVY.ap.speed, 'faster than tank shells');
assert.ok(shell.damage > HEAVY.he.damage, 'more damage than the tank HE shell');
assert.ok(shell.radius < HEAVY.he.radius / 2, 'much smaller blast');
assert.equal(shell.damage, FORTIFICATIONS.antitank.damage);
assert.equal(shell.interval, FORTIFICATIONS.antitank.interval);
assert.equal(heavyDamage('antitank', 0), shell.damage);
assert.equal(heavyDamage('antitank', shell.radius * 1.01), 0);

let now = 500000;
const game = new Game({ now: () => now });
const joined = game.join({ code: 'HOWITZER', name: 'Servant' });
const r = game.rooms.get('HOWITZER'),
  p = r.pilots.get(joined.id);
const gun = { kind: 'antitank', x: 0.5, y: 0, z: -0.5, hp: 180, ammo: 24, slot: 0 };
r.equipment = [gun];
p.mode = 'turret';
p.state.turret = 0;
const fire = (shot, direction) => (
  (p.seen = now),
  game.command('HOWITZER', p.id, 'antitank-fire', {
    station: 0,
    shot,
    incarnation: p.incarnation,
    direction,
  })
);

// 1. Horizontal shot: starts at the real muzzle and flies on (no muzzle blast).
fire('flat', [1, 0, 0]);
const flat = r.ordnance.find((o) => o.shot === 'flat');
assert.deepEqual(flat.p, howitzerMuzzle(gun, [1, 0, 0]), 'origin at the muzzle');
near(flat.p[1] - gun.y, MAP.metres(1.31), MAP.metres(0.05), 'muzzle height');
near(Math.hypot(...flat.v), shell.speed, 1e-12, 'muzzle velocity');
const start = [...flat.p];
now += 100;
resolveHeavy(game, r, { now: now });
assert.ok(!flat.done, 'still flying after 0.1 s');
assert.ok(flat.p[0] - start[0] > MAP.metres(60), 'travelled downrange: ' + (flat.p[0] - start[0]));
assert.ok(flat.v[1] < 0, 'gravity bends the trajectory like a tank shell');
assert.equal(r.effects.filter((e) => e.shot === 'flat').length, 0, 'no blast at the muzzle');
now += 9000;
resolveHeavy(game, r, { now: now });
assert.ok(!r.ordnance.includes(flat), 'shell ends on the floor or after its lifetime');

// 2. Direct hit on a ground insect: full damage, small blast effect.
Object.assign(r, { phase: 'combat', wave: 1, started: now, next_wave_at: 0 });
r.upcomingPlan = r.preparation = null;
r.plan = {
  budget: 0,
  roster: debugSwarmRoster(
    { rat: 1 },
    { room: r.code, wave: 1, started: now, now, balance: r.balance, firstId: 0, revision: 1 },
  ),
};
r.rosterRevision = 1;
const rat = r.plan.roster[0];
now = r.started + ((rat.spawn || 0) + (rat.entryHold || 0) + 2) * 1000;
const target = swarmFrame(r.plan.roster, (now - r.started) / 1000, r.groundAgents)[0].p;
Object.assign(gun, { x: target[0] + MAP.metres(30), y: 0, z: target[2], lastShotAt: -Infinity });
const muzzle = howitzerMuzzle(gun, [-1, 0, 0]);
const offset = target.map((v, i) => v - muzzle[i]),
  aim = offset.map((v) => v / Math.hypot(...offset));
fire('direct', aim);
const direct = r.ordnance.find((o) => o.shot === 'direct');
assert.ok(direct, 'aimed shell');
resolveHeavy(game, r, { now: now + 200 });
const blast = r.effects.find((e) => e.shot === 'direct');
assert.ok(blast, 'impact effect');
assert.equal(blast.kind, 'blast');
assert.equal(blast.radius, shell.radius, 'small blast radius');
// A rat's hit sphere is wider than the 5 m blast: the struck insect still takes
// the full charge (bonus 1 here), not a blast fraction measured from its centre.
assert.ok(
  r.kills.has(0) || r.enemyDamage[0] === shell.damage,
  'direct hit deals full damage: ' + r.enemyDamage[0],
);
console.log(
  'Antitank shell: server ballistic like the tank, ' +
    (shell.speed / MAP.ratio).toFixed(0) +
    ' m/s, ' +
    shell.damage +
    ' damage, ' +
    (shell.radius / MAP.ratio).toFixed(0) +
    ' m blast, leaves the muzzle when level.',
);

function near(a, b, eps, label) {
  assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
}
