import assert from 'node:assert/strict';
import { Game, IMPACT_GRACE_MS, HEAVY_CADENCE_TOLERANCE_MS } from '../server/game.js';
import { HEAVY } from '../src/armament.js';
import { debugSwarmRoster } from '../src/waves.js';

// Heavy weapons are simulated by their shooter; the server records launches,
// applies the shooter's impact report once, capped by the launch's power.
let now = 800000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'HEAVY', name: 'Tireur' }),
  b = game.join({ code: 'HEAVY', name: 'Allie' });
const r = game.rooms.get('HEAVY'),
  shooter = r.pilots.get(a.id),
  friend = r.pilots.get(b.id);
const gun = { kind: 'antitank', x: 0.5, y: 0, z: -0.5, hp: 180, ammo: 24, slot: 0 };
r.equipment = [gun];
shooter.mode = 'turret';
shooter.state.turret = 0;
const command = (pilot, path, body) => {
  pilot.seen = now;
  return game.command('HEAVY', pilot.id, path, body);
};
const fire = (shot) =>
  command(shooter, 'antitank-fire', {
    station: 0,
    shot,
    incarnation: shooter.incarnation,
    direction: [1, 0, 0],
  });
// 1. A launch is recorded, not simulated by the server.
fire('one');
const record = r.ordnance.find((s) => s.shot === 'one');
const launch = structuredClone(record);
now += 2000;
game.advance(r);
assert.deepEqual(
  r.ordnance.find((s) => s.shot === 'one'),
  launch,
  'the server does not fly it',
);
assert.equal(r.effects.filter((e) => e.shot === 'one').length, 0);
// 2. Combat: an enemy, a friend's vehicle and a friend on foot in the report.
Object.assign(r, { phase: 'combat', wave: 1, started: now, next_wave_at: 0 });
r.upcomingPlan = r.preparation = null;
r.plan = {
  budget: 1,
  roster: debugSwarmRoster(
    { rat: 1 },
    {
      room: 'HEAVY',
      wave: 1,
      started: now,
      now,
      balance: r.balance,
      firstId: 0,
      revision: 1,
    },
  ),
};
record.wave = 1;
const vehicle = [...r.vehicles.values()][0];
const cap = Math.ceil(HEAVY.antitank.damage * record.bonus) + 1;
const report = {
  shot: 'one',
  weapon: 'antitank',
  p: [1, 0.1, -0.5],
  enemies: [[0, 99999, [1, 0.1, -0.5]]],
  vehicles: [[vehicle.id, 30]],
  players: [[friend.id, 25]],
  kills: [friend.id],
};
// Another player cannot report this shell.
command(friend, 'heavy-impact', report);
assert.ok(r.ordnance.includes(record), "only the shooter's report counts");
command(shooter, 'heavy-impact', report);
assert.ok(!r.ordnance.includes(record), 'the launch ends with its impact');
assert.equal(r.effects.filter((e) => e.shot === 'one' && e.kind === 'blast').length, 1);
assert.equal(r.enemyDamage[0], Math.min(cap, r.plan.roster[0].hp + cap), 'damage is capped');
assert.ok(r.enemyDamage[0] <= cap);
assert.equal(vehicle.state.hp, 70, 'friendly hull damage is applied');
assert.equal(friend.health, 75, 'friendly blast damage is applied');
assert.equal(friend.life, 'alive', 'only an armour-piercing shell kills outright');
command(shooter, 'heavy-impact', report);
assert.equal(r.effects.filter((e) => e.shot === 'one').length, 1, 'applied once');
assert.equal(vehicle.state.hp, 70);
// 3. Fizzle: removed without blast.
now += 5000;
fire('two');
command(shooter, 'heavy-impact', { shot: 'two', fizzle: true });
assert.ok(!r.ordnance.some((s) => s.shot === 'two'));
assert.equal(r.effects.filter((e) => e.shot === 'two').length, 0);
// 4. Forgotten launch: expires after its lifetime plus a delay, without effect.
now += 5000;
fire('three');
now += HEAVY.antitank.lifetime * 1000 + IMPACT_GRACE_MS - 10;
game.advance(r);
assert.ok(
  r.ordnance.some((s) => s.shot === 'three'),
  'kept until the delay ends',
);
now += 20;
game.advance(r);
assert.ok(!r.ordnance.some((s) => s.shot === 'three'), 'then forgotten');
// 5. A shell still in flight when its shooter dies keeps its effect.
gun.lastShotAt = -Infinity;
fire('four');
game.kill(r, shooter, shooter.incarnation);
assert.equal(shooter.state.awaitingPurgatory, true);
command(shooter, 'heavy-impact', {
  shot: 'four',
  weapon: 'antitank',
  p: [1, 0.1, -0.5],
  enemies: [],
  vehicles: [[vehicle.id, 10]],
  players: [],
  kills: [],
});
assert.equal(vehicle.state.hp, 60);
// 6. Cadence: launches brought closer by network jitter stay accepted.
const shooter2 = r.pilots.get(game.join({ code: 'HEAVY', name: 'Second' }).id);
shooter2.mode = 'turret';
shooter2.state.turret = 0;
gun.lastShotAt = -Infinity;
const fire2 = (shot) =>
  command(shooter2, 'antitank-fire', {
    station: 0,
    shot,
    incarnation: shooter2.incarnation,
    direction: [1, 0, 0],
  });
fire2('cadence-1');
const interval = HEAVY.antitank.interval * 1000;
now += interval - HEAVY_CADENCE_TOLERANCE_MS / 2;
fire2('cadence-2');
now += interval - HEAVY_CADENCE_TOLERANCE_MS * 2;
assert.throws(() => fire2('cadence-3'), /recharge/, 'a really early launch is refused');
// 7. Malformed reports are refused.
assert.throws(() => command(shooter, 'heavy-impact', { shot: 5 }), /invalide/);
console.log(
  'Heavy impacts: recorded launch, shooter-only report, once, capped, friends hit, AP-only kill, fizzle, expiry, after death.',
);
