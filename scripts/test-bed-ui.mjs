import assert from 'node:assert/strict';
import { BedUI } from '../src/bed-ui.js';
class Element {
  constructor() {
    this.elements = new Map();
    this.textContent = '';
    this.disabled = false;
    this.classList = { add() {}, remove() {} };
    this.width = 800;
    this.height = 200;
  }
  querySelector(s) {
    if (!this.elements.has(s)) this.elements.set(s, new Element());
    return this.elements.get(s);
  }
  getContext() {
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture() {}
  toDataURL() {
    return 'data:image/png;base64,ink';
  }
}
let resolve,
  calls = 0,
  opened = 0,
  closed = 0;
const snap = { base: { epoch: 'a' } },
  root = new Element();
const ui = new BedUI({
  root,
  snapshot: () => snap,
  ground: () => ({ seq: 1 }),
  command: (body) => {
    calls++;
    assert.equal(body.signature, true);
    assert.equal(body.bed, 2);
    return new Promise((r) => (resolve = r));
  },
  accept() {},
  onOpen: () => opened++,
  onClose: () => closed++,
});
const self = { bedId: null, incarnation: 0, life: 'alive' };
ui.open({ slot: 2 }, self);
assert.equal(opened, 1);
const e = { pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
// The bed contract has no box to tick: it is signed as it is.
assert.equal(ui.clauses, null, 'no motive on a bed contract');
assert.ok(ui.canSign());
ui.canvas.onpointerdown(e);
ui.canvas.onpointermove({ ...e, clientX: 80 });
ui.canvas.onpointercancel();
ui.canvas.onpointerup({ ...e, clientX: 90 });
assert.equal(calls, 0);
ui.canvas.onpointerdown(e);
ui.canvas.onpointerup({ ...e, clientX: 90 });
assert.equal(calls, 1);
ui.close();
assert.equal(ui.opened, true, 'pending signature cannot be closed or duplicated');
ui.canvas.onpointerdown(e);
ui.canvas.onpointerup({ ...e, clientX: 90 });
assert.equal(calls, 1);
resolve(snap);
await new Promise((r) => setImmediate(r));
assert.equal(closed, 1);
ui.open({ slot: 2 }, { ...self, bedId: 2 });
assert.equal(ui.cancel, true);
assert.match(root.querySelector('h2').textContent, /Résiliation/);
assert.equal(ui.clauses, null, 'no motive on a cancellation either');
ui.close();
ui.open({ slot: 2 }, { ...self, bedId: 2 });
ui.observe({ ...self, incarnation: 1, life: 'dead' });
assert.equal(ui.opened, false, 'death clears pending local sheet');
console.log(
  'Bed UI: cancel/valid ink, single pending command, ACK, personal cancellation sheet, incarnation cleanup.',
);

// Workshop orders: three motives drawn from the pool, then the refused one, labelled.
const { purchaseMotives, PURCHASE_MOTIVE_POOL } = await import('../src/paper-form.ts');
const seen = new Set();
for (let i = 0; i < 40; i++) {
  const rule = purchaseMotives();
  assert.equal(rule.clauses.length, 4);
  assert.equal(new Set(rule.clauses.map((c) => c.id)).size, 4, 'no motive twice');
  assert.ok(rule.clauses.slice(0, 3).every((c) => !c.refused));
  assert.match(rule.clauses[3].text, /systématiquement refusé/);
  assert.ok(rule.clauses[3].refused);
  for (const c of rule.clauses) seen.add(c.id);
}
assert.ok(seen.size > 6, 'orders vary their motives');
assert.ok(PURCHASE_MOTIVE_POOL.length >= 6);
