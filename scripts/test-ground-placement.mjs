import assert from 'node:assert/strict';
import { groundPlacement } from '../src/ground-placement.js';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.js';
const defense = newGroundDefense();
const foot = { x: 0, z: 0, y: 0, face: 0, grounded: true };
const make = (overrides = {}) =>
  groundPlacement({ foot, mode: 'barricade', defense, dollars: 20, ...overrides });
const before = structuredClone(defense);
const first = make();
assert.equal(first.price, 1);
assert.deepEqual(defense, before, 'preview must not charge or mutate room');
assert.deepEqual(first.center, [0, -0.045]);
assert.equal(
  Math.hypot(first.command.a[0] - first.command.b[0], first.command.a[1] - first.command.b[1]),
  0.12,
);
const moved = make({ foot: { ...foot, x: 1, face: Math.PI / 2 } });
assert.ok(Math.abs(moved.center[0] - 1.045) < 1e-10);
const rotated = make({ rotation: Math.PI / 2 });
assert.ok(Math.abs(rotated.command.a[0] - rotated.command.b[0]) < 1e-10);
assert.match(make({ dollars: 0 }).error, /insuffisante/);
assert.match(make({ foot: { ...foot, grounded: false } }).error, /sol/);
assert.match(make({ foot: { ...foot, y: 0.1 } }).error, /sol/);
assert.match(make({ foot: { ...foot, x: 5 } }).error, /invalide/);
assert.equal(make({ mode: 'sugar' }).price, 3);
assert.equal(make({ mode: 'sticky' }).price, 1);
groundCommand(defense, first.command, [0, 0], 20);
assert.match(make().error, /occupé/);
const remove = make({ mode: 'remove' });
assert.equal(remove.command.id, defense.structures[0].id);
assert.equal(remove.price, 0);
defense.structures[0].hp = 50;
assert.equal(make({ mode: 'repair' }).price, 1);
assert.match(make({ mode: 'remove', foot: { ...foot, x: 1 } }).error, /Visez/);
console.log(
  'Third-person ground placement: movement, rotation, validation, costs and targeting OK',
);

// Exercise the actual controller with Three.js, without requiring a GPU.
const T = await import('../vendor/three.module.min.js');
const { GroundDefenseUI } = await import('../src/ground-defense-ui.js');
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
let snap = { code: 'ROOM', base: { epoch: 1 }, groundDefense: newGroundDefense(), dollars: 20 };
let allowed = true,
  enabled = true,
  captures = 0,
  releases = 0,
  resolve;
const commands = [];
const ui = new GroundDefenseUI({
  T,
  scene: new T.Scene(),
  document,
  snapshot: () => snap,
  foot: () => foot,
  available: () => allowed,
  enabled: () => enabled,
  captureMouse: () => captures++,
  releaseMouse: () => releases++,
  notify() {},
  command: (body) => {
    commands.push(body);
    return new Promise((r) => (resolve = r));
  },
});
ui.update();
ui.setOpen(true);
assert.equal(releases, 1);
assert.equal(
  document.body.children.some((e) => e.tag === 'canvas'),
  false,
);
ui.buttons.children[0].onclick();
assert.equal(ui.opened, false);
assert.equal(captures, 1);
ui.update();
assert.equal(ui.preview.visible, true);
const pending = ui.confirm();
await ui.confirm();
assert.equal(commands.length, 1, 'no duplicate purchase during pending request');
resolve();
await pending;
assert.equal(ui.active, true, 'continue building while walking');
ui.press();
foot.x += 0.57;
ui.release();
assert.equal(commands.length, 2);
const stroke = newGroundDefense();
assert.equal(groundCommand(stroke, commands[1], [foot.x, foot.z], 20).price, 3);
assert.equal(stroke.structures.length, 3);
assert.deepEqual(stroke.structures[0].b, stroke.structures[1].a);
resolve();
await Promise.resolve();
enabled = false;
ui.update();
assert.equal(ui.preview.visible, false);
enabled = true;
snap = { ...snap, base: { epoch: 2 } };
ui.update();
assert.equal(ui.active, false, 'reset cancels stale placement');
ui.buttons.children[0].onclick();
allowed = false;
ui.update();
assert.equal(ui.active, false, 'entering a vehicle or dying cancels placement');
assert.equal(ui.preview.visible, false);
console.log('Ground placement UI: menu, ghost, pending command, modal suspension and reset OK');
