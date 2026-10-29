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
  archived = 0,
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
  archive: () => archived++,
});
const self = { bedId: null, incarnation: 0, life: 'alive' };
ui.open({ slot: 2 }, self);
assert.equal(opened, 1);
const e = { pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
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
assert.equal(archived, 1);
assert.equal(closed, 1);
ui.open({ slot: 2 }, { ...self, bedId: 2 });
assert.equal(ui.cancel, true);
assert.match(root.querySelector('h2').textContent, /Résiliation/);
ui.observe({ ...self, incarnation: 1, life: 'dead' });
assert.equal(ui.opened, false, 'death clears pending local sheet');
console.log(
  'Bed UI: cancel/valid ink, single pending command, ACK archive, personal cancellation sheet, incarnation cleanup.',
);
