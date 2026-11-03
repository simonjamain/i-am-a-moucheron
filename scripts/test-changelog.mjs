import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAYER_CHANGELOG, mountChangelog } from '../src/changelog.js';

const currentVersion = Number(readFileSync('VERSION', 'utf8').trim());
assert.ok(PLAYER_CHANGELOG[0]?.version <= currentVersion, 'aucune nouveauté future');
assert.ok(PLAYER_CHANGELOG.length >= 2, 'historique de plusieurs versions');
for (let i = 0; i < PLAYER_CHANGELOG.length; i++) {
  const entry = PLAYER_CHANGELOG[i];
  assert.ok(Number.isSafeInteger(entry.version) && entry.version > 0);
  if (i) assert.ok(PLAYER_CHANGELOG[i - 1].version > entry.version, 'versions décroissantes');
  assert.ok(entry.changes.length > 0);
  assert.ok(entry.changes.every((change) => typeof change === 'string' && change.length <= 130));
}

// Test léger de l'interface, sans navigateur ni moteur 3D.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.handlers = new Map();
    this.textContent = '';
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  addEventListener(type, handler) {
    this.handlers.set(type, handler);
  }
  emit(type, target = this) {
    this.handlers.get(type)({ target });
  }
}
const document = {
  createDocumentFragment: () => new Element('fragment'),
  createElement: (tag) => new Element(tag),
};
const dialog = new Element('dialog');
dialog.open = false;
dialog.showModal = () => {
  dialog.open = true;
};
dialog.close = () => {
  dialog.open = false;
};
const trigger = new Element('button'),
  close = new Element('button'),
  list = new Element('div');
let releasedControls = 0;
mountChangelog({
  dialog,
  trigger,
  close,
  list,
  document,
  onOpen: () => releasedControls++,
});
const items = list.children[0].children;
assert.equal(items.length, PLAYER_CHANGELOG.length);
assert.equal(items[0].children[0].textContent, 'Version ' + currentVersion);
assert.equal(items[0].children[1].children[0].textContent, PLAYER_CHANGELOG[0].changes[0]);
trigger.emit('click');
trigger.emit('click');
assert.equal(releasedControls, 1, 'ouverture sans doublon');
assert.equal(dialog.open, true);
close.emit('click');
assert.equal(dialog.open, false);
trigger.emit('click');
dialog.emit('click', dialog);
assert.equal(dialog.open, false, 'fermeture en cliquant le fond');
console.log('PASS: version, historique, rendu texte sûr et ouverture/fermeture des nouveautés.');
