// Garde-fou du lanceur de `npm test` : en parallèle, un script qui échoue, rejette une
// promesse ou est tué doit rester un échec, avec sa sortie complète ; --bail ne démarre
// plus de script après le premier échec. Sans cela, la suite et le job CI
// « Full game regression » pourraient passer au vert sur un test rouge.
import assert from 'node:assert/strict';
import { runScripts } from './run-tests.mjs';

const dir = 'scripts/fixtures/runner/';
const files = ['pass', 'fail', 'killed', 'late', 'rejects'].map((n) => dir + n + '.mjs');
const done = [];
const results = await runScripts(files, { jobs: 3, onDone: (r) => done.push(r.file) });
const by = Object.fromEntries(results.map((r) => [r.file.slice(dir.length, -4), r]));

assert.equal(results.length, files.length, 'every script runs');
assert.deepEqual(done.sort(), [...files].sort(), 'onDone reports every script once');
assert.equal(by.pass.status, 0);
assert.match(by.pass.output, /pass output/);
assert.equal(by.late.status, 0, 'a script is awaited until its process ends');
assert.match(by.late.output, /late output/);
assert.notEqual(by.fail.status, 0, 'an assertion failure is a failure');
assert.match(by.fail.output, /before failure[\s\S]*fixture failure/, 'stdout and stderr kept');
assert.notEqual(by.rejects.status, 0, 'a rejected top-level await is a failure');
assert.equal(by.killed.status, null);
assert.equal(by.killed.signal, 'SIGKILL', 'a killed script is reported, not passed');

const bailed = await runScripts([dir + 'fail.mjs', dir + 'pass.mjs', dir + 'late.mjs'], {
  jobs: 1,
  bail: true,
});
assert.deepEqual(
  bailed.map((r) => r.file),
  [dir + 'fail.mjs'],
  '--bail starts nothing after a failure',
);
console.log('test runner: failures, rejections and kills stay red in parallel; --bail stops');
