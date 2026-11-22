import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BankUI, loanText } from '../src/bank-ui.js';
import { equipmentHUD, ContextHUD } from '../src/hud.js';
import { newBank, signLoan, settleLoans } from '../src/bank.ts';
import { Game } from '../server/game.js';

class Element {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.textContent = '';
    this.dataset = {};
    this.attributes = {};
    this.disabled = false;
    this.classList = {
      values: new Set(),
      toggle(name, on) {
        if (on ?? !this.values.has(name)) this.values.add(name);
        else this.values.delete(name);
      },
      add(...names) {
        for (const name of names) this.values.add(name);
      },
      remove(...names) {
        for (const name of names) this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    };
    this.map = new Map();
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  querySelector(selector) {
    if (!this.map.has(selector)) this.map.set(selector, new Element(selector));
    return this.map.get(selector);
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  getContext() {
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
  focus() {}
  get offsetWidth() {
    return 0;
  }
}
let snapshot = { dollars: 10, bank: newBank(() => 0), base: { epoch: 1 } },
  calls = 0,
  opens = 0,
  closes = 0,
  signedCount = 0,
  complete,
  reject;
const root = new Element();
const ui = new BankUI({
  root,
  document: {
    createElement: (tag) => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
  },
  snapshot: () => snapshot,
  command: (path, body) => {
    calls++;
    assert.equal(body.epoch, 1);
    assert.equal(body.signature, true);
    assert.equal(path, 'bank-sign', 'the bank has a single command: signing an offer');
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
  onSigned: () => signedCount++,
});
const coupon = (slot) => ui.cards.children[slot];
const stampMark = root.querySelector('[data-stamp]');
ui.open();
assert.equal(opens, 1);
assert.equal(ui.cards.children.length, 3, 'three coupons on one prospectus');
assert.equal(ui.sheet.classList.contains('hidden'), true, 'no offer ticked by default');
assert.ok(
  ui.cards.children.every((card) => card.getAttribute('aria-checked') === 'false'),
  'no coupon ticked by default',
);
coupon(0).onclick();
assert.equal(ui.selection.serial, 1);
assert.equal(coupon(0).getAttribute('aria-checked'), 'true', 'the ticked coupon');
assert.equal(ui.sheet.classList.contains('hidden'), false);
assert.equal(root.querySelector('[data-bank-schedule]').children.length, 4);
assert.equal(root.classList.contains('locked'), true, 'signature locked before the purpose');
const canvas = ui.canvas,
  pointer = { pointerId: 1, clientX: 10, clientY: 20, preventDefault() {} };
canvas.onpointerdown(pointer);
canvas.onpointerup({ ...pointer, clientX: 80 });
assert.equal(calls, 0, 'no signature without the loan purpose');
assert.match(ui.status.textContent, /objet du prêt/);
ui.clauses.toggle('comfort');
assert.equal(ui.clauses.refused, false, 'the bank accepts « convenance personnelle »');
assert.equal(root.classList.contains('locked'), false);
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
assert.equal(signedCount, 1);
assert.equal(snapshot.bank.slots[0].status, 'active');
assert.equal(ui.selection.serial, 1, 'the signed contract stays on the sheet');
assert.equal(stampMark.textContent, 'APPROUVÉ');
assert.equal(stampMark.classList.contains('printed'), true);
assert.equal(root.querySelector('[data-clauses]').classList.contains('hidden'), true);
assert.ok(
  coupon(0).children.some((el) => el.textContent === 'SIGNÉ'),
  'a signed coupon is stamped',
);
// The paid instalments of a signed contract are stamped PAYÉ.
settleLoans(snapshot.bank, 1);
ui.render();
const rows = root.querySelector('[data-bank-schedule]').children;
assert.equal(rows[0].children.at(-1).textContent, 'PAYÉ');
assert.equal(rows[1].children.at(-1).textContent, '');
// A failed deposit shows its message and lets the player sign again.
coupon(1).onclick();
ui.clauses.toggle('defense');
const failed = ui.submit();
reject(Error('Réseau interrompu'));
await failed;
assert.match(ui.status.textContent, /Réseau/);
assert.equal(signedCount, 1);
assert.equal(ui.busy, false);
assert.equal(ui.canSign(), true);
// Negative balance: offers can no longer be ticked.
snapshot.dollars = -1;
ui.selection = null;
ui.render();
assert.equal(coupon(2).getAttribute('aria-disabled'), 'true');
coupon(2).onclick();
assert.equal(ui.selection, null);
assert.match(ui.status.textContent, /négative/);
coupon(0).onclick();
assert.equal(ui.selection.serial, 1, 'a signed contract stays readable');
ui.close();
assert.equal(closes, 1);
snapshot.dollars = 10;
ui.open();
coupon(1).onclick();
snapshot.base.epoch++;
ui.render();
assert.equal(ui.selection, null, 'reset invalidates the document');
assert.match(loanText(snapshot.bank.slots[0]), /solde négatif/);
assert.doesNotMatch(loanText(snapshot.bank.slots[0]), /anticipé/);

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
assert.equal(model.readout.metres, 300);
assert.equal(model.left[1], '90 cm', '300 reference metres shown as their real 90 cm');
assert.ok(Math.abs(model.readout.fraction - 2 / 11) < 1e-10);
let now = 0;
const markup = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const rails = new Element();
const railMarkup = markup.slice(
  markup.indexOf('<div id="contextHUD"'),
  markup.indexOf('<div id="aimRange"'),
);
for (const [, key] of railMarkup.matchAll(/data-hud="([^"]+)"/g))
  rails.map.set(`[data-hud="${key}"]`, new Element());
for (const [, side] of railMarkup.matchAll(/data-hud-details="([^"]+)"/g)) {
  const details = new Element();
  details.ownerDocument = { createElement: (tag) => new Element(tag) };
  rails.map.set(`[data-hud-details="${side}"]`, details);
}
rails.querySelector = (selector) => rails.map.get(selector) ?? null;
const hud = new ContextHUD(rails, () => now);
const leftDetails = rails.querySelector('[data-hud-details="left"]');
const rightDetails = rails.querySelector('[data-hud-details="right"]');
hud.update(equipmentHUD({ turret: true, station: 'dcaHeavy', stationAmmo: 120 }));
assert.deepEqual(
  leftDetails.children.map((row) => row.textContent),
  ['1,5 cm', 'Molette', '100 PV'],
);
assert.deepEqual(
  rightDetails.children.map((row) => row.textContent),
  ['Obus 120/120', 'Souffle : 12 cm'],
);
const firstRow = leftDetails.children[0];
hud.update(equipmentHUD({ turret: true, station: 'dcaHeavy', stationAmmo: 119 }));
assert.equal(leftDetails.children[0], firstRow, 'reuse rows between frames');
assert.equal(rightDetails.children[0].textContent, 'Obus 119/120');
hud.update(equipmentHUD({ turret: true, station: 'dcaRapid', stationAmmo: 1000 }));
assert.equal(leftDetails.children.length, 0, 'clear details from the previous station');
assert.deepEqual(
  rightDetails.children.map((row) => row.textContent),
  ['4 mitrailleuses'],
);
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
assert.equal(room.bank.slots[0].status, 'active');
const cash = room.dollars;
assert.throws(
  () =>
    game.command(room.code, joined.id, 'bank-repay', {
      slot: 0,
      serial: offer.serial,
      signature: true,
    }),
  'early repayment no longer exists',
);
assert.equal(room.dollars, cash);
assert.equal(room.bank.slots[0].status, 'active');
console.log(
  'HUD/bank UI: contextual roles and fallback, real fuse units, timed expansion, three coupons, loan purpose, sparse/cancel/repeated signatures, ACK gating, PAYÉ schedules, errors, negative balance, stale/reset documents.',
);
