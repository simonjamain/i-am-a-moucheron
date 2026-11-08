// Issue #100: one room-wide debug switch replaces the balance and manual swarm
// tools. Debug: unlimited money, every plan unlocked, no fall damage, no defeat
// (bin damage still counted). Turning it off restores a clean normal game.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Game } from '../server/game.js';
import { BLUEPRINTS } from '../src/wave-blueprints.js';
import { DEFAULT_BALANCE } from '../src/balance.js';

let now = 500000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'DEBUG', name: 'A' });
const b = game.join({ code: 'DEBUG', name: 'B' });
const r = game.rooms.get('DEBUG');
const send = (id, path, body = {}) => {
  for (const p of r.pilots.values()) p.seen = now;
  return game.command('DEBUG', id, path, body);
};
const sync = (id) =>
  send(id, 'sync', { state: r.pilots.get(id).state, mode: r.pilots.get(id).mode });
const fall = (id, speed, shot) =>
  send(id, 'fall-impact', { incarnation: r.pilots.get(id).incarnation, shot, speed });

// The removed tools are no longer network commands, and their UI is gone.
for (const path of ['balance', 'debug-spawn'])
  assert.throws(
    () => send(a.id, path, { epoch: r.base.epoch, revision: 0, values: {}, counts: { midge: 1 } }),
    /inconnue/,
  );
assert.equal(existsSync('src/balance-ui.js'), false);
const html = readFileSync('src/index.html', 'utf8');
assert.doesNotMatch(html, /balanceOpen|balancePanel|data-spawn-fields/);
assert.match(html, /<button id="labOpen" aria-pressed="false"[^>]*>\s*Debug : OFF\s*<\/button>/);
assert.deepEqual(r.balance, DEFAULT_BALANCE, 'fixed default rules');

// Normal rules first: a hard fall hurts.
assert.ok(fall(a.id, 100, 'normal-1') && r.pilots.get(a.id).life === 'dead', 'fatal fall');
send(a.id, 'reset', { epoch: r.base.epoch });

// One switch for the whole room, flipped by any player, seen by everyone.
send(b.id, 'lab', { epoch: r.base.epoch, action: 'enable' });
let seen = sync(a.id);
assert.equal(seen.lab.enabled, true);
assert.ok(seen.dollars >= 1e9, 'unlimited money');
for (const card of Object.keys(BLUEPRINTS)) assert.ok(seen.blueprintLevels[card] >= 1, card);
assert.throws(() => send(a.id, 'lab', { epoch: r.base.epoch, action: 'enable' }), /déjà actif/);

// No fall damage, even a fatal-speed landing.
fall(a.id, 100, 'debug-1');
assert.equal(r.pilots.get(a.id).life, 'alive');
assert.equal(r.pilots.get(a.id).health, 100);

// Defeat impossible: the bin keeps counting damage past 20, the wave ends normally.
game.startWave(r);
r.infestation = 95;
for (let i = 0; i < game.plan(r).roster.length; i++) r.kills.add(i);
seen = sync(a.id);
assert.equal(seen.phase, 'prep', 'next wave prepared instead of a defeat');
assert.equal(seen.infestation, 95, 'bin damage is still computed');
assert.equal(20 - seen.infestation, -75, 'HUD shows negative bin HP');
const client = readFileSync('src/client.js', 'utf8');
assert.match(
  client,
  /s\.lab\?\.enabled\s*\?\s*20 - \(s\.infestation \+ s\.leaked\) \+ ' \/ 20 PV'/,
);
// Money stays unlimited across wave transitions and purchases.
r.blueprintLevels.lure = 3;
send(a.id, 'wave-buy', { epoch: r.base.epoch, blueprint: 'lure', level: 1 });
assert.ok(sync(b.id).dollars >= 1e9);

// Switching off restores normal rules without leftovers in the economy.
send(a.id, 'lab', { epoch: r.base.epoch, action: 'exit' });
seen = sync(b.id);
assert.equal(seen.lab, undefined);
assert.equal(seen.dollars, DEFAULT_BALANCE.startingMoney);
assert.deepEqual(seen.blueprintLevels, {});
assert.deepEqual(seen.activeBlueprints, {});
assert.equal(seen.infestation, 0);
assert.equal(seen.wave, 0);
fall(b.id, 100, 'normal-2');
assert.equal(r.pilots.get(b.id).life, 'dead', 'falls hurt again');
// And defeat is possible again.
send(a.id, 'reset', { epoch: r.base.epoch });
game.startWave(r);
r.infestation = 20;
for (let i = 0; i < game.plan(r).roster.length; i++) r.kills.add(i);
assert.equal(sync(a.id).phase, 'lost');
console.log(
  'Debug mode: one room switch, tools removed, ∞ money, plans, no fall damage, no defeat, clean exit.',
);
