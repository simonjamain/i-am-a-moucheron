// Garde-fou : un script test-*.mjs non branché ne protège rien. Chaque test doit
// être dans la suite de `npm test` (scripts/suite.mjs), ou dans une commande
// dédiée listée ici avec sa raison (et dans OUTSIDE_SUITE).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SUITE, OUTSIDE_SUITE } from './suite.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.scripts.test, 'node scripts/run-tests.mjs', 'npm test passe par run-tests.mjs');
const dedicated = {
  // Lourd (50 pairs réels) : `npm run test:capacity` et job CI « 50 native UDP peers ».
  'test-udp-capacity-50': 'test:capacity',
};
assert.deepEqual([...OUTSIDE_SUITE].sort(), Object.keys(dedicated).sort());

const scripts = readdirSync('scripts');
const files = scripts.filter((f) => /^test-.*\.mjs$/.test(f)).map((f) => f.slice(0, -4));
const orphans = files.filter((f) => !SUITE.includes(f) && !(f in dedicated));
assert.deepEqual(orphans, [], `Tests absents de scripts/suite.mjs : ${orphans.join(', ')}`);
assert.equal(new Set(SUITE).size, SUITE.length, 'Script listé deux fois dans la suite');

for (const [file, script] of Object.entries(dedicated)) {
  assert.ok(files.includes(file), `${file}.mjs déclaré mais absent`);
  assert.ok(
    pkg.scripts[script]?.includes(`scripts/${file}.mjs`),
    `${script} ne lance plus ${file}`,
  );
}
// Chaque script de la suite doit exister ; ce message désigne directement le fichier.
for (const name of SUITE)
  assert.ok(scripts.includes(name + '.mjs'), `scripts/${name}.mjs introuvable`);
console.log(`suite wiring: ${files.length} test scripts, ${SUITE.length} in npm test`);
