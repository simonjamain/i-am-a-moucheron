// Issue #135: the room debug mode is a plain ON/OFF toggle. Its effects stay
// (unlimited funds, every plan unlocked, room isolation, reset on exit); the
// former test tools (cards, waves, scenarios) are refused.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../server/game.js';
import { BLUEPRINTS } from '../src/wave-blueprints.js';
import { LabUI } from '../src/lab-ui.js';

let now = 100000;
const game = new Game({ now: () => now });
const a = game.join({ code: 'LAB', name: 'Testeur' });
const b = game.join({ code: 'LAB', name: 'Coéquipier' });
const other = game.join({ code: 'NORMAL', name: 'Autre' });
const room = game.rooms.get('LAB');
const regular = game.rooms.get('NORMAL');
const send = (action, extra = {}, id = a.id) =>
  game.command('LAB', id, 'lab', { epoch: room.base.epoch, action, ...extra });
assert.equal(a.snapshot.lab?.enabled ?? false, false);
assert.equal(other.snapshot.lab?.enabled ?? false, false);
assert.throws(() => send('exit'), /inactif/);
assert.throws(() => send('enable', { epoch: 'obsolete' }), /changé/);
assert.deepEqual(send('enable', {}, b.id).lab, { enabled: true }, 'no scenario list on wire');
assert.throws(() => send('enable'), /déjà actif/);
assert.equal(regular.lab.enabled, false, 'isolated room');
for (const card of Object.keys(BLUEPRINTS)) assert.equal(room.blueprintLevels[card], 1);
assert.equal(room.dollars, 1000000000);
assert.equal(room.phase, 'prep', 'enabling opens the first preparation');
for (const action of ['card', 'unlock', 'wave', 'start', 'finish', 'save', 'load', 'delete'])
  assert.throws(() => send(action, { card: 'reinforced', wave: 7, name: 'x' }), /inconnue/);
game.command('LAB', a.id, 'reset', { epoch: room.base.epoch });
assert.equal(room.lab.enabled, true, 'normal reset keeps debug mode');
const afterExit = send('exit');
assert.equal(afterExit.lab?.enabled ?? false, false);
assert.equal(room.wave, 0);
assert.equal(room.blueprintLevels.piercing, undefined);
assert.equal(room.dollars, room.balance.startingMoney, 'exit resets the game');
assert.equal(regular.lab.enabled, false);

// Client: one click enables, the next disables, without confirmation or panel.
let snap = { base: { epoch: 'e1' }, lab: null };
const requests = [];
const button = {
  classes: new Set(),
  attributes: {},
  classList: {
    toggle(name, on) {
      if (on) button.classes.add(name);
      else button.classes.delete(name);
    },
  },
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
};
const ui = new LabUI({
  button,
  snapshot: () => snap,
  command: async (body) => {
    requests.push(body);
    return { lab: body.action === 'enable' ? { enabled: true } : undefined };
  },
  accept: (next) => (snap = { ...snap, lab: next.lab || null }),
  notify() {},
});
assert.equal(button.textContent, 'Debug : OFF');
assert.equal(button.attributes['aria-pressed'], 'false');
await button.onclick();
assert.deepEqual(requests.at(-1), { epoch: 'e1', action: 'enable' });
assert.equal(button.textContent, 'Debug : ON');
assert.equal(button.classes.has('debugOn'), true, 'active state is visible');
await button.onclick();
assert.deepEqual(requests.at(-1), { epoch: 'e1', action: 'exit' });
assert.equal(button.textContent, 'Debug : OFF');
assert.equal(requests.length, 2);
const html = readFileSync('src/index.html', 'utf8');
assert.doesNotMatch(html, /labPanel|data-lab-|Outils de test|Scénarios/, 'no debug panel');
console.log('PASS: interrupteur debug, effets conservés, outils retirés, isolation et sortie.');
