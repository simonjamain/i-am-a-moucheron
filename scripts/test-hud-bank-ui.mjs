import assert from 'node:assert/strict';
import { BankUI, loanText } from '../src/bank-ui.js';
import { equipmentHUD, ContextHUD } from '../src/hud.js';
import { newBank, signLoan, settleLoans } from '../src/bank.js';
import { Game } from '../server/game.js';

class Element {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.textContent = '';
    this.dataset = {};
    this.disabled = false;
    this.classList = {
      values: new Set(),
      toggle(name, on) {
        if (on ?? !this.values.has(name)) this.values.add(name);
        else this.values.delete(name);
      },
      add(name) {
        this.values.add(name);
      },
      remove(name) {
        this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    };
    this.map = new Map();
  }
  querySelector(selector) {
    if (!this.map.has(selector)) this.map.set(selector, new Element(selector));
    return this.map.get(selector);
  }
  append(child) {
    this.children.push(child);
  }
  replaceChildren() {
    this.children = [];
  }
  getContext() {
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
  toDataURL() {
    return 'data:image/png;base64,signature';
  }
  focus() {}
}
let snapshot = { dollars: 10, bank: newBank(() => 0), base: { epoch: 1 } },
  calls = 0,
  opens = 0,
  closes = 0,
  archives = 0,
  complete,
  reject;
const root = new Element();
const ui = new BankUI({
  root,
  document: { createElement: (tag) => new Element(tag) },
  snapshot: () => snapshot,
  command: (path, body) => {
    calls++;
    assert.equal(body.epoch, 1);
    assert.equal(body.signature, true);
    assert.ok(['bank-sign', 'bank-repay'].includes(path));
    return new Promise((yes, no) => {
      complete = yes;
      reject = no;
    });
  },
  accept: (value) => {
    snapshot = value;
    ui.render();
  },
  onOpen: () => opens++,
  onClose: () => closes++,
  archive: () => archives++,
});
ui.open();
assert.equal(opens, 1);
assert.equal(ui.cards.children.length, 3);
ui.cards.children[0].children.find((el) => el.tag === 'button').onclick();
assert.equal(ui.selection.serial, 1);
const canvas = ui.canvas,
  pointer = { pointerId: 1, clientX: 10, clientY: 20, preventDefault() {} };
canvas.onpointerdown(pointer);
canvas.onpointermove({ ...pointer, clientX: 60 });
canvas.onpointercancel();
canvas.onpointerup({ ...pointer, clientX: 80 });
assert.equal(calls, 0, 'cancel never signs');
canvas.onpointerdown(pointer);
canvas.onpointerup({ ...pointer, clientX: 80 });
assert.equal(calls, 1, 'mouse/touch sparse stroke signs on release');
canvas.onpointerdown(pointer);
canvas.onpointerup({ ...pointer, clientX: 80 });
ui.close();
assert.equal(ui.opened, true, 'cannot close or double-sign while result is pending');
assert.equal(calls, 1);
const result = structuredClone(snapshot);
signLoan(result.bank, 0, 1, 1000, 0);
result.dollars += 12;
complete(result);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(archives, 1);
assert.equal(ui.selection, null);
assert.equal(snapshot.bank.slots[0].status, 'active');
ui.select(snapshot.bank.slots[0], false);
assert.equal(canvas.classList.contains('hidden'), true, 'signed loan is read-only');
assert.equal(root.querySelector('[data-bank-schedule]').children.length, 4);
ui.select(snapshot.bank.slots[0], true);
settleLoans(snapshot.bank, 1);
ui.render();
assert.equal(ui.selection, null, 'an intervening repayment requires a freshly read document');
ui.select(snapshot.bank.slots[0], true);
const failed = ui.submit();
reject(Error('Réseau interrompu'));
await failed;
assert.match(ui.status.textContent, /Réseau/);
assert.equal(archives, 1);
assert.equal(ui.busy, false);
snapshot.dollars = -1;
ui.selection = null;
ui.render();
assert.equal(ui.cards.children[1].children.find((el) => el.tag === 'button').disabled, true);
ui.close();
assert.equal(closes, 1);
ui.open();
ui.select(snapshot.bank.slots[1], false);
snapshot.base.epoch++;
ui.render();
assert.equal(ui.selection, null, 'reset invalidates the document');
assert.match(loanText(snapshot.bank.slots[0]), /solde négatif/);

const vehicle = {
  id: 'tank-1',
  type: 'tank',
  supplies: { ammo: { he: 0, ap: 29, coax: 1400, top: 1500, pilot: 1000 } },
};
let model = equipmentHUD({ vehicle, seat: 'cannon', ammo: 1400, shell: 'he' });
assert.equal(model.left[1], 'AP');
assert.match(model.left[2], /HE 0 \/ AP 29/);
assert.equal(model.right[1], '1400');
assert.equal(equipmentHUD({ vehicle, seat: 'pilot', ammo: 999 }).left[0], 'CONDUITE');
assert.equal(equipmentHUD({ vehicle, seat: 'top', ammo: 1499 }).left[1], '360°');
for (const type of ['fighter', 'interceptor', 'bomber'])
  for (const seat of ['pilot', 'dorsal', 'tail'])
    assert.ok(equipmentHUD({ vehicle: { ...vehicle, type }, seat, ammo: 12 }));
assert.equal(equipmentHUD({ vehicle, seat: 'pilot', dead: true }), null);
assert.equal(equipmentHUD({}), null);
model = equipmentHUD({ turret: true, range: 300 });
assert.equal(model.readout.metres, 0.9);
assert.ok(Math.abs(model.readout.fraction - 2 / 11) < 1e-10);
let now = 0;
const rails = new Element(),
  hud = new ContextHUD(rails, () => now);
hud.update(model);
assert.equal(rails.classList.contains('expanded'), true);
now = 3000;
hud.update(model);
assert.equal(rails.classList.contains('expanded'), false);
model = equipmentHUD({ turret: true, range: 325 });
hud.update(model);
assert.equal(rails.classList.contains('expanded'), true);
hud.update(null);
assert.equal(rails.classList.contains('hidden'), true);

// Actual room command rejects a stale document after reset and a different
// capital after an intervening wave, without touching the balance.
const game = new Game(),
  joined = game.join({ code: 'BANKUI' }),
  room = game.rooms.get('BANKUI');
room.dollars = 50;
const offer = room.bank.slots[0];
assert.throws(
  () =>
    game.command(room.code, joined.id, 'bank-sign', {
      slot: 0,
      serial: offer.serial,
      signature: true,
      epoch: -1,
    }),
  /partie/,
);
game.command(room.code, joined.id, 'bank-sign', {
  slot: 0,
  serial: offer.serial,
  signature: true,
  epoch: room.base.epoch,
});
const cash = room.dollars;
assert.throws(
  () =>
    game.command(room.code, joined.id, 'bank-repay', {
      slot: 0,
      serial: offer.serial,
      signature: true,
      expectedRemaining: -1,
    }),
  /capital/,
);
assert.equal(room.dollars, cash);
console.log(
  'HUD/bank UI: contextual roles and fallback, real fuse units, timed expansion, three cards, sparse/cancel/repeated signatures, ACK gating, read-only schedules, errors, negative balance, stale/reset documents.',
);
