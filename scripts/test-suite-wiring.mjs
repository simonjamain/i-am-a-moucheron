// Garde-fou : un script test-*.mjs non branché ne protège rien. Chaque test doit
// être dans la suite de `npm test` (scripts/suite.mjs), ou dans une commande
// dédiée listée ici avec sa raison (et dans OUTSIDE_SUITE).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SUITE, OUTSIDE_SUITE, E2E, E2E_MANUAL } from './suite.mjs';

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
// Même garde pour les scénarios navigateur : un e2e-*.mjs absent de `npm run e2e` (et donc
// de la CI) n'est plus exécuté et pourrit sans bruit (e2e-loading l'a montré).
assert.equal(
  pkg.scripts.e2e,
  'node scripts/run-tests.mjs --e2e',
  'npm run e2e passe par le lanceur',
);
const manualE2e = {
  // Sélecteur de plans : 135 s en local, expire sur le runner CI (90 s d'attente de page).
  'e2e-layouts': 'e2e:layouts',
};
assert.deepEqual([...E2E_MANUAL].sort(), Object.keys(manualE2e).sort());
const e2eFiles = scripts.filter((f) => /^e2e-.*\.mjs$/.test(f)).map((f) => f.slice(0, -4));
const e2eOrphans = e2eFiles.filter((f) => !E2E.includes(f) && !(f in manualE2e));
assert.deepEqual(
  e2eOrphans,
  [],
  `Scénarios absents de E2E (scripts/suite.mjs) : ${e2eOrphans.join(', ')}`,
);
assert.equal(new Set(E2E).size, E2E.length, 'Scénario listé deux fois dans E2E');
for (const name of E2E) assert.ok(e2eFiles.includes(name), `scripts/${name}.mjs introuvable`);
for (const [file, script] of Object.entries(manualE2e))
  assert.ok(
    pkg.scripts[script]?.includes(`scripts/${file}.mjs`),
    `${script} ne lance plus ${file}`,
  );
// Les jobs de PR doivent continuer à lancer ces contrôles : une étape retirée du workflow
// laisserait la CI verte sans rien vérifier (docs/operations.md#intégration-continue).
const ci = readFileSync('.github/workflows/docker-build.yml', 'utf8');
for (const [job, command] of [
  ['docker-build', 'node scripts/smoke-image.ts'],
  ['game-regression', 'npm test'],
  ['game-regression', 'node scripts/validate-artifact.mjs'],
  ['browser-e2e', 'npm run e2e'],
]) {
  const block = ci.split(/\n  (?=[a-z0-9-]+:\n)/).find((b) => b.startsWith(job + ':'));
  assert.ok(block, `job ${job} absent de docker-build.yml`);
  assert.ok(block.includes(command), `job ${job} ne lance plus « ${command} »`);
}
console.log(
  `suite wiring: ${files.length} test scripts, ${SUITE.length} in npm test, ${E2E.length}/${e2eFiles.length} browser scenarios in npm run e2e`,
);
