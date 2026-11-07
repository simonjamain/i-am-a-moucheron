import assert from 'node:assert/strict';
import { groundPlacement } from '../src/ground-placement.js';
import { newGroundDefense, groundCommand } from '../src/ground-defense-state.js';
const defense = newGroundDefense();
const foot = { x: 0, z: 0, y: 0, face: 0, grounded: true };
const make = (overrides = {}) =>
  groundPlacement({ foot, mode: 'barricade', defense, dollars: 20, ...overrides });
const aim = { x: 0, y: 0, z: -0.045 };
const before = structuredClone(defense);
assert.equal(make({ aim }).startOnly, true);
assert.deepEqual(defense, before, 'preview does not mutate the room');
assert.match(make().error, /Visez/);
const first = make({ aim, anchor: [0.12, -0.045] });
assert.equal(first.price, 1);
assert.deepEqual(first.center, [0, -0.045]);
assert.deepEqual(
  make({ aim, anchor: [0.12, -0.045], foot: { ...foot, face: 2 } }).command,
  first.command,
);
assert.deepEqual(make({ aim, anchor: [0.12, -0.045], rotation: 2 }).command, first.command);
assert.match(make({ aim, anchor: [0.12, -0.045], dollars: 0 }).error, /insuffisante/);
assert.match(make({ aim, foot: { ...foot, grounded: false } }).error, /sol/);
assert.match(make({ aim, foot: { ...foot, y: 0.1 } }).error, /sol/);
assert.match(make({ aim, anchor: [aim.x, aim.z] }).error, /distance/);
assert.equal(make({ aim, mode: 'sugar' }).price, 3);
assert.equal(make({ aim, mode: 'sticky', anchor: [0.12, -0.045] }).price, 1);
groundCommand(defense, first.command, [0, 0], 20);
assert.equal(make({ aim, mode: 'remove' }).command.id, defense.structures[0].id);
defense.structures[0].hp = 50;
assert.equal(make({ aim, mode: 'repair' }).price, 1);
console.log('Camera placement: anchors, direction independence, validation and targeting OK');

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
  context = 'foot',
  enabled = true,
  captures = 0,
  releases = 0,
  resolve;
let target = { ...aim };
const commands = [];
const ui = new GroundDefenseUI({
  T,
  scene: new T.Scene(),
  document,
  snapshot: () => snap,
  foot: () => foot,
  aim: () => target,
  available: () => allowed && ['foot', 'castor'].includes(context),
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
ui.press();
assert.equal(commands.length, 0, 'first click only anchors');
target = { ...target, x: 0.12 };
const pending = ui.confirm();
await ui.confirm();
assert.equal(commands.length, 1, 'no duplicate purchase during pending request');
resolve();
await pending;
assert.equal(ui.active, true, 'continue building while walking');
ui.press();
foot.x += 0.57;
target = { ...target, x: target.x + 0.57 };
assert.equal(commands.length, 1, 'first click only anchors');
ui.press();
assert.equal(commands.length, 2);
const stroke = newGroundDefense();
assert.equal(groundCommand(stroke, commands[1], [foot.x, foot.z], 20).price, 3);
assert.equal(stroke.structures.length, 3);
assert.deepEqual(stroke.structures[0].b, stroke.structures[1].a);
resolve();
await Promise.resolve();
assert.equal(ui.openWheel(), true);
ui.finishWheel();
assert.equal(ui.active, false);
for (let i = 0; i < ui.tools.length; i++) {
  ui.openWheel();
  const angle = (i * 2 * Math.PI) / ui.tools.length;
  ui.moveWheel(80 * Math.sin(angle), -80 * Math.cos(angle));
  ui.finishWheel();
  assert.equal(ui.mode, ui.tools[i][0]);
}
assert.equal(commands.length, 2, 'selecting a sector never builds');
ui.openWheel();
ui.moveWheel(80, -25);
ui.finishWheel();
ui.press();
assert.equal(commands[2].kind, 'sugar');
resolve();
await Promise.resolve();
ui.cancel();
assert.equal(ui.handleWheelKey('KeyG', true), true, 'G opens the wheel on foot');
assert.equal(ui.wheelSource, 'keyboard');
assert.equal(ui.handleWheelKey('KeyG', true, true), true, 'key repeats keep the same wheel');
ui.moveWheel(0, -80);
assert.equal(ui.handleWheelKey('KeyG', false), true, 'releasing G selects the sector');
assert.equal(ui.mode, 'barricade');
assert.equal(ui.active, true);
assert.equal(ui.radial, false);
ui.cancel();
context = 'castor';
assert.equal(ui.handleWheelKey('KeyG', true), true, 'G opens the wheel as Castor driver');
ui.moveWheel(80, 0);
assert.equal(ui.finishWheel(), false, 'middle mouse release must not end the G wheel');
assert.equal(ui.radial, true);
assert.equal(ui.handleWheelKey('KeyG', false), true);
assert.equal(ui.mode, 'sticky');
ui.cancel();
assert.equal(ui.handleWheelKey('KeyG', false), false, 'keyup after cancel is ignored');
context = 'aircraft';
assert.equal(ui.handleWheelKey('KeyG', true), false, 'no building in unauthorized vehicles');
context = 'foot';
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

const { placementAim } = await import('../src/placement-aim.js');
const { brickLayout, createBrickWall } = await import('../src/brick-wall.js');
const floor = { min: { x: -4, y: -0.1, z: -4 }, max: { x: 4, y: 0, z: 4 } };
const eye = { x: 0, y: 0.04, z: 0.04 };
const direction = { x: 0, y: -1, z: -2 };
const body = { x: 0, y: 0, z: 0, face: 0, grounded: true };
const aimed = placementAim(body, eye, direction, [floor], 0.24);
assert.deepEqual(aimed, { x: 0, y: 0, z: -0.04 });
assert.deepEqual(placementAim({ ...body, face: 2 }, eye, direction, [floor], 0.24), aimed);
assert.equal(placementAim(body, eye, { x: 0, y: 1, z: 0 }, [floor], 0.24), null);
assert.equal(placementAim(body, eye, { x: 1, y: 0, z: 0 }, [floor], 0.24), null);
assert.equal(placementAim(body, eye, direction, [floor], 0.027), null);
const obstruction = { min: { x: -0.01, y: 0, z: 0 }, max: { x: 0.01, y: 0.03, z: 0.01 } };
assert.equal(
  placementAim(body, eye, direction, [floor, obstruction], 0.24),
  null,
  'side blocks target behind it',
);
assert.ok(
  placementAim(
    body,
    { x: 0, y: 0.04, z: 0.005 },
    { x: 0, y: -1, z: 0 },
    [floor, obstruction],
    0.24,
  ),
);
for (const mode of ['sugar', 'fan', 'repair', 'remove']) {
  const a = groundPlacement({ foot: body, mode, aim: aimed, defense, dollars: 100 });
  const b = groundPlacement({
    foot: { ...body, face: Math.PI },
    mode,
    aim: aimed,
    defense,
    dollars: 100,
  });
  assert.deepEqual(a, b, mode + ' ignores movement heading');
}
assert.ok(brickLayout(0.2).length > brickLayout(0.04).length);
for (const length of [0.002, 0.04, 0.2]) {
  for (const brick of brickLayout(length))
    assert.ok(Math.abs(brick.x) + brick.width / 2 <= length / 2 + 1e-8);
  const wall = createBrickWall(T, { a: [0, 0], b: [length, 0], hp: 100 });
  assert.equal(wall.count, brickLayout(length).length);
  assert.ok(wall.instanceColor);
  assert.equal(wall.visible, true);
  wall.geometry.dispose();
  wall.material.dispose();
}
ui.buttons.children[0].onclick();
allowed = true;
ui.update();
assert.equal(ui.preview.scale.x, 0.008, 'unanchored preview has no wall orientation');
target = null;
ui.press();
assert.equal(ui.anchor, null, 'invalid aim cannot anchor');
assert.equal(commands.length, 3, 'invalid aim cannot purchase');
console.log('Camera ray: surfaces, occlusion, reach; Meshy wall: variable count and bounds OK');
