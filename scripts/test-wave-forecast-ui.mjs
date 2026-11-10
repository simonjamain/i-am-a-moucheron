import assert from 'node:assert/strict';
import { timelineColumns, WaveCouncilUI } from '../src/wave-council-ui.js';
import { predictedGroundPaths } from '../src/wave-ground-paths.js';
import { groundFlow, groundCommand, newGroundDefense } from '../src/ground-defense-state.js';
import { enemyRoute, portalExit, PORTALS } from '../src/routes.js';

const groups = [
  { ground: true, type: 'ant', portalIndex: 1, count: 5, spawn: 6 },
  { ground: false, type: 'midge', portalIndex: 0, count: 3, spawn: 1 },
  { ground: false, type: 'dart', portalIndex: 0, count: 1, spawn: 6 },
];
assert.deepEqual(timelineColumns(groups), [
  [1, [groups[1]]],
  [6, [groups[0], groups[2]]],
]);
const request = { groups: [groups[0]], walls: [] };
const original = predictedGroundPaths(request)[0];
// Undefended desk: the forecast is the nominal route, which is the walked one.
assert.deepEqual(
  original.points.map(([x, , z]) => [x, z]),
  enemyRoute(groups[0])
    .points.filter((p) => p[1] < 0.01)
    .map(([x, , z]) => [x, z]),
);
const defense = newGroundDefense();
const flow = groundFlow(defense);
const [x, , z] = portalExit(PORTALS.ground[1]);
const before = flow.route([x, z]);
const [cx, cz] = before[6];
const command = { kind: 'barricade', action: 'build', a: [cx - 0.1, cz], b: [cx + 0.1, cz] };
const preview = predictedGroundPaths({ ...request, command })[0];
groundCommand(defense, command, command.a, 10);
const confirmed = predictedGroundPaths({ ...request, walls: defense.structures })[0];
assert.deepEqual(preview, confirmed);
assert.notDeepEqual(
  confirmed.points.map(([x, , z]) => [x, z]),
  before,
);
assert.ok(confirmed.points.length);
assert.equal(request.walls.length, 0);

class Element {
  children = [];
  attrs = {};
  open = false;
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  append(...items) {
    this.children.push(...items);
  }
  replaceChildren(...items) {
    this.children = items;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}
const elements = new Map();
const document = {
  createElement: () => new Element(),
  getElementById: (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  },
};
const commands = [];
const ui = new WaveCouncilUI({
  document,
  command: (...args) => commands.push(args),
  releaseMouse() {},
});
const snap = {
  base: { epoch: 'e' },
  groundDefense: defense,
  vehicles: [],
  pilots: [{ id: 'p' }, { id: 'q' }],
  dollars: 12,
  preparation: { id: 'e1', wave: 1, groups },
};
ui.accept(snap, 'p');
ui.countdown(45);
assert.equal(ui.dialog.open, false);
assert.equal(ui.button.textContent, 'Vague 1 · 45 s');
assert.doesNotMatch(ui.button.textContent, /vote/);
ui.button.onclick();
assert.equal(ui.timeline.children.length, 2);
assert.equal(ui.timeline.children[1].children.length, 3);
// No vote: the announced wave can be launched at once by any player.
assert.equal(ui.launch.hidden, false);
assert.equal(commands.length, 0);
ui.launch.onclick();
assert.deepEqual(commands.pop(), ['start', { preparation: 'e1' }]);
ui.accept({ ...snap, preparation: null }, 'p');
assert.equal(ui.dialog.open, false);
assert.equal(ui.button.hidden, true, 'nothing to announce during combat');
console.log(
  'PASS frise simultanée, annonce sans vote, départ anticipé, détour simulé puis confirmé',
);
