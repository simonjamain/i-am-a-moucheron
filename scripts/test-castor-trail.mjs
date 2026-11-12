// Issue #99: the Castor lays its LEGO wall progressively and visibly, one brick
// at a time behind the truck, and walls/tape are billed 1 $ per 20 cm pro rata.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { GroundDefenseUI, BRICK_PITCH, TRAIL_MAX, trailBricks } from '../src/ground-defense-ui.js';
import { groundCommand, lengthPrice, newGroundDefense } from '../src/ground-defense-state.js';

// Pro-rata price: exact length, to the cent, never rounded up to 20 cm.
assert.equal(lengthPrice('barricade', 0.2), 1);
assert.equal(lengthPrice('barricade', 0.07), 0.31);
assert.equal(lengthPrice('sticky', 0.33), 1.65);
assert.equal(lengthPrice('barricade', 0.001), 0.01, 'never free');
const fresh = newGroundDefense();
const cost = groundCommand(
  fresh,
  { action: 'build', kind: 'barricade', a: [0, 0], b: [0.23, 0] },
  [0, 0],
  5,
);
assert.equal(cost.price, 1.19);
assert.equal(fresh.structures.length, 5, 'split into 48 mm segments and a half-brick tail');
assert.throws(
  () =>
    groundCommand(
      newGroundDefense(),
      { action: 'build', kind: 'barricade', a: [0, 0], b: [0.2, 0] },
      [0, 0],
      0.99,
    ),
  /insuffisante/,
  'insufficient bank stops the build',
);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.style = {};
    this.children = [];
  }
  setAttribute() {}
  append(...items) {
    this.children.push(...items);
  }
  querySelectorAll(tag) {
    return this.children.filter((c) => c.tag === tag);
  }
  querySelector(tag) {
    return this.querySelectorAll(tag)[0];
  }
}
const document = { createElement: (tag) => new Element(tag), body: new Element('body') };
const snap = { code: 'ROOM', base: { epoch: 1 }, groundDefense: newGroundDefense(), dollars: 20 };
const castor = { rear: [0, 0], grounded: true, y: 0.001, x: 0, z: 0 };
const commands = [];
let resolve;
const ui = new GroundDefenseUI({
  T,
  scene: new T.Scene(),
  document,
  snapshot: () => snap,
  foot: () => castor,
  builder: () => castor,
  aim: () => ({ x: 0, y: 0, z: 0 }),
  available: () => true,
  enabled: () => true,
  captureMouse() {},
  releaseMouse() {},
  notify() {},
  command: (body) => {
    commands.push(body);
    return new Promise((r) => (resolve = r));
  },
});
ui.update(); // first frame binds the room
ui.mode = 'barricade';
ui.active = true;
ui.update();
const initialGhost = new T.Box3().setFromObject(ui.preview);
assert.ok(
  initialGhost.min.z >= -0.0002 && initialGhost.max.z > 0.047,
  'unstarted wall ghost is behind the Castor, independent of pointer',
);
ui.press();
assert.deepEqual(ui.trailAnchor, [0, 0], 'start under the truck');
const brickCount = () => {
  let n = 0;
  ui.preview.traverse((o) => {
    if (o.isInstancedMesh) n += o.count;
  });
  return n;
};
// Drive slowly: bricks appear one column at a time, no command before 20 cm.
let previous = 0;
const seen = new Set();
for (let x = 0.005; x < 0.048; x += 0.003) {
  castor.rear = [x, 0];
  ui.update();
  assert.equal(commands.length, 0, 'nothing committed before 20 cm');
  const bricks = Math.floor(x / 0.012);
  if (bricks) {
    assert.equal(ui.preview.visible, true, 'section visible behind the truck');
    assert.ok(brickCount() >= previous, 'bricks never disappear while driving');
    previous = brickCount();
    seen.add(bricks);
  }
  assert.match(
    ui.status.textContent,
    /mur LEGO en continu · \d+,\d\d \$ en cours · 0,25 \$ \/ 48 mm au prorata/,
  );
}
assert.ok(seen.size >= 3, 'columns added one by one (' + seen.size + ')');
assert.equal(trailBricks(BRICK_PITCH * 3 + 1e-9), 3);
// At 20 cm, one exact section is committed and the anchor advances on success.
castor.rear = [0.05, 0];
ui.update();
assert.equal(commands.length, 1);
assert.deepEqual(commands[0].a, [0, 0]);
assert.ok(Math.abs(commands[0].b[0] - 0.048) < 1e-12);
assert.equal(groundCommand(newGroundDefense(), commands[0], [0, 0], 20).price, 0.25);
resolve(true);
await Promise.resolve();
await Promise.resolve();
assert.ok(Math.abs(ui.trailAnchor[0] - 0.048) < 1e-12);
// Stop after 7 cm more: the started section is kept and billed 0,35 $.
castor.rear = [0.08, 0];
ui.update();
ui.press();
assert.equal(ui.trailAnchor, null, 'click stops the trail');
assert.equal(commands.length, 2);
const tail = groundCommand(newGroundDefense(), commands[1], [0.08, 0], 20);
assert.equal(tail.price, 0.13);
assert.notEqual(commands[0].request, commands[1].request, 'distinct idempotency keys');
resolve(true);
await Promise.resolve();
// A jump beyond the trail limit interrupts instead of laying a long wall.
ui.press();
castor.rear = [0.08 + TRAIL_MAX + 0.01, 0];
ui.update();
await Promise.resolve();
assert.equal(ui.trailAnchor, null, 'interrupted');
assert.equal(commands.length, 2);
console.log(
  'Castor trail: bricks one by one behind the truck, 48 mm LEGO sections, kept half-brick tail, pro-rata cents.',
);

// Sticky tape keeps its original 10 mm minimum and price.
castor.rear = [0, 0];
ui.mode = 'sticky';
ui.press();
castor.rear = [0.0115, 0];
ui.press();
assert.equal(commands.length, 3);
assert.equal(groundCommand(newGroundDefense(), commands[2], [0, 0], 20).price, 0.06);
resolve(true);
await Promise.resolve();
