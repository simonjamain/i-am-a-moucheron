// Office pack (BloxBits "Cartoon Office Pack"): embedded models, room shell and
// hand-placed props of every layout. See docs/office-layouts.md.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import { MODEL_DATA } from '../src/office-pack-data.ts';
import { OFFICE_MODELS, OFFICE_PACK_UNIT } from '../src/office-pack-catalog.ts';
import { propColliders, propFootprint, modelBoxes } from '../src/office-props.ts';
import {
  LAYOUTS,
  LAYOUT_ROOM,
  WALL_HEIGHT,
  DESK_TOP,
  setActiveLayout,
  layoutSolids,
} from '../src/layouts.ts';
import { OFFICE_CLOUD_TOP, OFFICE_FOG_START, FOG_START_RATIO } from '../src/office-fog.ts';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.ts';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`);
const { x: X, z: Z } = LAYOUT_ROOM;

// Licence: the data module points to the notice; the notice names the author.
const data = readFileSync('src/office-pack-data.ts', 'utf8').slice(0, 400);
assert.match(data, /office-pack-LICENSE\.md/);
assert.ok(existsSync('src/office-pack-LICENSE.md'));
assert.match(readFileSync('src/office-pack-LICENSE.md', 'utf8'), /BloxBits[\s\S]*redistribution/);
assert.match(MODEL_DATA.sourceSha256, /^[0-9a-f]{64}$/);

// Embedded geometry matches the catalogue the server uses for hitboxes.
const parts = new Map(MODEL_DATA.parts.map((p) => [p.part, p]));
assert.deepEqual([...parts.keys()].sort(), Object.keys(OFFICE_MODELS).sort());
for (const [name, bounds] of Object.entries(OFFICE_MODELS)) {
  const part = parts.get(name);
  assert.equal(Buffer.from(part.indices, 'base64').length / 6, bounds.triangles, name);
  const v = new Int16Array(new Uint8Array(Buffer.from(part.positions, 'base64')).buffer);
  for (let i = 0; i < v.length; i += 3)
    for (let k = 0; k < 3; k++) {
      assert.ok(v[i + k] * 5e-4 >= bounds.min[k] - 1e-6, name + ' min');
      assert.ok(v[i + k] * 5e-4 <= bounds.max[k] + 1e-6, name + ' max');
    }
}
// One wall module is 1.2 m and 2.7 m high: the room is 7 x 6 modules, its walls
// end in the clouds, whose haze still starts where it did (air routes unchanged).
near(OFFICE_MODELS.Wall.max[2] - OFFICE_MODELS.Wall.min[2], 1.2, 1e-3, 'module width');
near(OFFICE_MODELS.Wall.max[1], WALL_HEIGHT, 1e-3, 'wall height');
near(OFFICE_PACK_UNIT, 1.2 / 5.4, 1e-6, 'uniform scale');
assert.equal(OFFICE_CLOUD_TOP, WALL_HEIGHT);
near(OFFICE_FOG_START, 2.2125, 1e-9, 'haze start');
near(OFFICE_CLOUD_TOP * FOG_START_RATIO, OFFICE_FOG_START, 1e-12, 'ratio');
// Small items never block; desks leave room underneath.
assert.equal(modelBoxes('Mug').length, 0);
assert.ok(modelBoxes('Desk').every((b) => b[1] > 0.1 || b[4] <= 0.74));

const used = new Set();
for (const layout of LAYOUTS) {
  setActiveLayout(layout.id);
  const name = layout.id + ': ';
  for (const p of layout.props) used.add(p.model);
  // Shell: wall bodies start exactly on the room boundary, full height.
  const shell = layout.shellSolids;
  assert.ok(
    shell.some((b) => b.max.z === -Z && b.max.y === WALL_HEIGHT),
    name + 'back wall face',
  );
  assert.ok(
    shell.some((b) => b.max.x === -X && b.max.y === WALL_HEIGHT),
    name + 'left wall face',
  );
  assert.ok(
    shell.some((b) => b.min.x === X && b.max.y === WALL_HEIGHT),
    name + 'right wall face',
  );
  // Vents: one per air entry, flush on the wall face, centred on the entry.
  const vents = layout.props.filter((p) => p.model === 'Wall_Vent');
  assert.equal(vents.length, layout.portals.air.length, name + 'one vent per air entry');
  for (const [x, y, z] of layout.portals.air) {
    const back = Math.abs(x) < X - 0.2;
    const v = vents.find((p) => (back ? Math.abs(p.x - x) < 1e-9 : Math.abs(p.z - z) < 1e-9));
    assert.ok(v, name + 'vent at ' + [x, z]);
    near(v.y + OFFICE_MODELS.Wall_Vent.max[1] / 2, y, 1e-9, name + 'vent centred');
    if (back) near(v.z, -Z, 1e-9, name + 'vent on the back wall face');
    else near(Math.abs(v.x), X, 1e-9, name + 'vent on the side wall face');
  }
  // A closed office door, in a module of its own, away from every entry.
  const doors = layout.props.filter((p) => p.model === 'Office_Door');
  assert.equal(doors.length, 1, name + 'one door');
  assert.equal(layout.props.filter((p) => p.model === 'Wall_Door').length, 1);
  const d = doors[0];
  const doorBack = Math.abs(d.x) < X;
  for (const [x, , z] of [...layout.portals.air, ...layout.portals.ground]) {
    const sameWall = doorBack
      ? Math.abs(x) < X - 0.2
      : Math.sign(x) === Math.sign(d.x) && Math.abs(x) > X - 0.2;
    if (sameWall)
      assert.ok(Math.abs(doorBack ? x - d.x : z - d.z) > 0.85, name + 'door clear of entries');
  }
  // Props stand inside the room; nothing solid interpenetrates.
  const own = layout.props.filter((p) => !p.ghost);
  for (const p of own) {
    if (['Office_Door', 'Wall_Vent'].includes(p.model)) continue;
    const f = propFootprint(p);
    assert.ok(
      f.min.x >= -X - 1e-3 && f.max.x <= X + 1e-3 && f.min.z >= -Z - 1e-3 && f.max.z <= Z + 1e-3,
      name + p.model + ' inside the room',
    );
  }
  const boxes = own.flatMap((p, i) => propColliders(p).map((c) => ({ p, i, c })));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].i === boxes[j].i) continue;
      const a = boxes[i].c,
        b = boxes[j].c;
      const overlap = ['x', 'y', 'z'].map(
        (k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]),
      );
      assert.ok(
        !overlap.every((o) => o > 0.01),
        name + boxes[i].p.model + ' overlaps ' + boxes[j].p.model,
      );
    }
  // What stands at desk height stands on a desk.
  const desks = own.filter((p) => p.model === 'Desk').map(propFootprint);
  for (const p of own.filter((q) => Math.abs(q.y - DESK_TOP) < 1e-9))
    assert.ok(
      desks.some((f) => p.x > f.min.x && p.x < f.max.x && p.z > f.min.z && p.z < f.max.z),
      name + p.model + ' on a desk',
    );
  // The scene: one instanced mesh per model, mouse holes on the skirting boards.
  const scene = new T.Scene();
  const office = createOffice(T, scene, createGraphics(T, scene));
  const instanced = [];
  office.root.traverse((o) => o.isInstancedMesh && instanced.push(o));
  assert.equal(instanced.length, new Set(layout.props.map((p) => p.model)).size, name + 'batched');
  assert.equal(
    instanced.reduce((n, m) => n + m.count, 0),
    layout.props.length,
    name + 'every prop drawn',
  );
  const holes = [];
  office.root.traverse((o) => o.name === 'mouse-hole' && holes.push(o));
  assert.equal(holes.length, layout.portals.ground.length);
  for (const h of holes) {
    const onSide = Math.abs(h.position.x) > X - 0.1;
    near(
      onSide ? Math.abs(h.position.x) : -h.position.z,
      (onSide ? X : Z) - 0.018,
      1e-9,
      'hole on skirting',
    );
    assert.equal(h.position.y, 0, 'hole at the foot of the wall');
  }
  assert.equal(office.colliders.length, layoutSolids(layout).length);
  office.dispose();
}
// The import stays trimmed to the models the layouts place.
assert.deepEqual(
  Object.keys(OFFICE_MODELS).filter((m) => !used.has(m)),
  [],
  'unused models in the import',
);
// No randomness: every layout is a fixed, hand-made list.
assert.doesNotMatch(readFileSync('src/layouts.ts', 'utf8'), /Math\.random/);
setActiveLayout(LAYOUTS[0].id);
console.log(
  `Office pack: ${Object.keys(OFFICE_MODELS).length} models, ${MODEL_DATA.triangles} triangles; shell, flush vents and holes, one door, no overlap, desk items on desks.`,
);
