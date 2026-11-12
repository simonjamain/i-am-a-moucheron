// Player appearances: eight user-approved Meshy + Mixamo characters, picked on the
// home screen, carried by the join command and drawn for every player; models
// turn smoothly toward their facing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import {
  APPEARANCES,
  DEFAULT_APPEARANCE,
  appearanceId,
  nextAppearance,
} from '../src/character-appearances.js';
import {
  createCharacter,
  loadCharacter,
  characterLoaded,
  availableAppearance,
  turnToward,
  CHARACTER_HEIGHT,
} from '../src/character-model.js';
import { createGraphics } from '../src/graphics.js';
import { PANEL_TINT, SIDE_SHADE } from '../src/appearance-picker.js';
import { Game } from '../server/game.js';
import { OFFICE_SOLIDS } from '../worker/assets.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, label + ': ' + a + ' vs ' + b);
const world = (o) => o.getWorldPosition(new T.Vector3());

// 1. Registry: eight distinct characters, default first, selector wraps around.
assert.equal(APPEARANCES.length, 8);
assert.equal(new Set(APPEARANCES.map((a) => a.id)).size, 8);
assert.deepEqual(
  APPEARANCES.map((a) => a.name),
  [
    'Aventurier',
    'Aventurière',
    'Aviateur',
    'Mécanicien',
    'Mécanicienne',
    'Aviatrice',
    'Opérateur',
    'Opératrice',
  ],
);
assert.equal(DEFAULT_APPEARANCE, 'cowboy');
assert.equal(appearanceId('toby'), 'toby');
for (const bad of [undefined, null, '', 'admin', '__proto__', 3])
  assert.equal(appearanceId(bad), 'cowboy');
assert.equal(nextAppearance('cowboy', -1), APPEARANCES.at(-1).id);
assert.equal(nextAppearance(APPEARANCES.at(-1).id, 1), 'cowboy');
assert.equal(nextAppearance('cowboy', 1), APPEARANCES[1].id);

// 2. Imports: provenance matches the importer, the other models load on demand.
const importer = readFileSync('scripts/import-character.py', 'utf8');
assert.ok(characterLoaded('cowboy'));
assert.equal(availableAppearance('aviator'), 'cowboy', 'default drawn while loading');
for (const { id } of APPEARANCES) {
  assert.equal(await loadCharacter(id), id);
  assert.ok(characterLoaded(id), id);
}
assert.equal(availableAppearance('aviator'), 'aviator');
for (const { id } of APPEARANCES) {
  const c = createCharacter(T, id);
  assert.equal(c.appearance, id);
  assert.ok(importer.includes("'" + id + "'"), id + ' listed in the importer');
  // Every character is drawn at the same height, feet on the ground.
  const box = new T.Box3().setFromObject(c.container);
  near(box.max.y, CHARACTER_HEIGHT, 1e-3, id + ' height');
  near(box.min.y, 0, 0.02, id + ' feet');
  for (const bone of ['Hips', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftFoot'])
    assert.ok(c.bones['mixamorig' + bone], id + ' ' + bone);
  // Gait clips, and a rest pose with the arms down where the export has no idle.
  for (let i = 0; i < 20; i++) c.update(0.05, {});
  assert.equal(c.gait(), 'idle');
  const segment = (from, to) =>
    world(c.bones['mixamorig' + to])
      .sub(world(c.bones['mixamorig' + from]))
      .normalize();
  for (const side of ['Left', 'Right'])
    assert.ok(segment(side + 'Arm', side + 'ForeArm').y < -0.8, id + ' ' + side + ' arm down');
  c.update(0.05, { speed: 1.4 });
  assert.equal(c.gait(), 'walk');
  c.update(0.05, { speed: 6 });
  assert.equal(c.gait(), 'run');
}
for (const id of ['frontier', 'sky-pilot', 'toby', 'sunny', 'aviator', 'signaler', 'operator']) {
  const source = readFileSync('src/character-' + id + '-data.js', 'utf8');
  const sha = /"sha256":"([0-9a-f]{64})"/.exec(source)[1];
  assert.ok(importer.includes(sha), id + ' provenance');
}
// Same appearance shares its resources; another one does not.
const a = createCharacter(T, 'toby'),
  b = createCharacter(T, 'toby'),
  c = createCharacter(T, 'sunny');
assert.equal(a.mesh.geometry, b.mesh.geometry);
assert.notEqual(a.mesh.geometry, c.mesh.geometry);
assert.notEqual(a.skeleton, b.skeleton);

// 3. Game humanoid: built with an appearance, swapped in place with its frame.
const scene = new T.Scene(),
  graphics = createGraphics(T, scene);
const human = graphics.humanoid('#8bc9d6', false, 'frontier');
scene.add(human);
assert.equal(human.userData.appearance, 'frontier');
const marker = new T.Object3D();
human.userData.arms[1].elbow.add(marker);
human.userData.setAppearance('sky-pilot');
assert.equal(human.userData.appearance, 'sky-pilot');
assert.equal(human.userData.character.appearance, 'sky-pilot');
assert.equal(
  human.userData.rig.children.filter((o) => o.name === 'personnage').length,
  1,
  'old model removed',
);
assert.equal(marker.parent, human.userData.arms[1].elbow, 'pistol frame kept');
human.updateMatrixWorld(true);
const shoulder = world(human.userData.character.bones.mixamorigRightArm);
assert.ok(world(human.userData.arms[1].pivot).distanceTo(shoulder) < 1e-6, 'pivot on the shoulder');
human.userData.setAppearance('unknown');
assert.equal(human.userData.appearance, 'cowboy');

// 4. Server: the join command carries the choice, validated, shared with everyone.
const game = new Game({ now: () => 1000, solids: OFFICE_SOLIDS });
const one = game.join({ code: 'LOOKS', name: 'Un', appearance: 'sunny' });
const two = game.join({ code: 'LOOKS', name: 'Deux', appearance: '<script>' });
const three = game.join({ code: 'LOOKS', name: 'Trois' });
const pilots = two.snapshot.pilots;
assert.equal(pilots.find((p) => p.id === one.id).appearance, 'sunny');
assert.equal(pilots.find((p) => p.id === two.id).appearance, 'cowboy');
assert.equal(three.snapshot.pilots.find((p) => p.id === three.id).appearance, 'cowboy');

// 5. Smooth turning: shortest arc, exponential approach, no overshoot.
near(turnToward(0, 1, 0), 0, 1e-12, 'no time, no turn');
near(turnToward(0, 1, 10), 1, 1e-9, 'settles on the target');
const half = turnToward(0, Math.PI / 2, 0.05);
assert.ok(half > 0 && half < Math.PI / 4, 'partial step per frame: ' + half);
// Across ±π: 3.0 → -3.0 turns through π (+0.28 rad), not back through 0.
const wrap = turnToward(3, -3, 0.05);
assert.ok(wrap > 3 && wrap < 3 + 0.29, 'wraps the short way: ' + wrap);
let yaw = 0;
for (let i = 0; i < 60; i++) yaw = turnToward(yaw, Math.PI * 0.9, 1 / 60);
near(yaw, Math.PI * 0.9, 0.01, 'half turn done within a second');

// 6. Client and home screen wiring.
const html = readFileSync('src/index.html', 'utf8');
const client = readFileSync('src/client.js', 'utf8');
const form = html.slice(html.indexOf('<form id="form"'), html.indexOf('</form>'));
assert.doesNotMatch(form, /Même code, même partie/);
const order = [
  'id="code"',
  'id="appearancePrev"',
  'id="appearanceView"',
  'id="appearanceNext"',
  'id="join"',
];
order.reduce((at, key) => {
  const i = form.indexOf(key);
  assert.ok(i > at, key + ' between the fields and the join button');
  return i;
}, -1);
assert.match(client, /appearance: appearancePicker\.value/);
assert.match(client, /turnToward\(g\.rotation\.y, Math\.PI - b\.face, dt\)/);
assert.doesNotMatch(client, /g\.rotation\.y = Math\.PI - b\.face;\n\s+if \(!g\.userData\.chute\)/);
// No second WebGL context nor read-back of the game canvas (each one left
// Chrome several times slower for the whole game): draw straight into it.
const picker = readFileSync('src/appearance-picker.js', 'utf8');
for (const slow of [
  /new T\.WebGLRenderer/,
  /readRenderTargetPixels|readPixels/,
  /drawImage|getImageData/,
])
  assert.doesNotMatch(picker, slow);
assert.match(client, /toon\.render\(scene, camera\);\n\s+appearancePicker\.draw\(renderer, dt\);/);
assert.match(
  html,
  /\.appearance \{[^}]*box-shadow: 0 0 0 100vmax #102b29eb/,
  'see-through selector',
);
// No frame of its own (the preview redraws the panel colour), the name is for
// screen readers only, and no empty line below the join button.
const css = (selector) => new RegExp(selector + ' \\{([^}]*)\\}').exec(html)[1];
assert.doesNotMatch(css('\\.appearance'), /border|background:/);
// Panel and side shade redrawn from the page's own colours.
assert.deepEqual(PANEL_TINT, { color: [0x10, 0x2b, 0x29], alpha: 0xeb / 255 });
assert.deepEqual(SIDE_SHADE, { color: [0x0b, 0x21, 0x1f], alpha: 0xee / 255, end: 0.85 });
assert.match(html, /#shade \{[^}]*linear-gradient\(90deg, #0b211fee, transparent 85%\)/);
assert.match(css('#appearanceName'), /clip-path: inset\(50%\)/);
assert.match(html, /#error:empty \{\s*display: none;/);
assert.doesNotMatch(css('#error'), /min-height/);
const packaged = readFileSync('scripts/assemble.mjs', 'utf8');
for (const module of [
  'appearance-picker',
  'character-appearances',
  ...APPEARANCES.slice(1).map((a) => 'character-' + a.id + '-data'),
])
  assert.ok(packaged.includes("'" + module + "'"), module + ' packaged');
console.log(
  'Appearances: eight characters, on-demand loading, equal heights, rest pose, in-place swap, join validation, smooth turning, home selector.',
);
