// Garde-fou : un script test-*.mjs non branché ne protège rien. Chaque test doit
// être dans `npm test`, ou dans une commande dédiée listée ici avec sa raison.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const full = pkg.scripts.test;
const dedicated = {
  // Lourd (50 pairs réels) : `npm run test:capacity` et job CI « 50 native UDP peers ».
  'test-udp-capacity-50.mjs': 'test:capacity',
};

const files = readdirSync('scripts').filter((f) => /^test-.*\.mjs$/.test(f));
const orphans = files.filter((f) => !full.includes(`scripts/${f}`) && !(f in dedicated));
assert.deepEqual(orphans, [], `Tests absents de « npm test » : ${orphans.join(', ')}`);

for (const [file, script] of Object.entries(dedicated)) {
  assert.ok(files.includes(file), `${file} déclaré mais absent`);
  assert.ok(pkg.scripts[script]?.includes(`scripts/${file}`), `${script} ne lance plus ${file}`);
}

// Chaque script référencé par « npm test » doit exister (une faute de frappe
// ferait échouer la chaîne, mais ce message désigne directement le fichier).
const referenced = [...full.matchAll(/node (scripts\/[\w.-]+\.mjs)/g)].map((m) => m[1]);
for (const r of referenced)
  assert.ok(readdirSync('scripts').includes(r.slice(8)), `${r} introuvable`);
console.log(`suite wiring: ${files.length} test scripts, ${referenced.length} in npm test`);
