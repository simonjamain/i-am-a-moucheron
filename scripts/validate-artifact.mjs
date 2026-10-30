import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(pkg.type, 'module');
assert.equal(pkg.scripts.start, 'node server/index.js');
assert.ok(pkg.dependencies['node-datachannel']);
await access(resolve(root, 'package-lock.json'));
for (const file of ['server/index.js', 'server/game.js', 'server/session.js']) {
  execFileSync(process.execPath, ['--check', resolve(root, file)]);
}
// Validate local module dependencies in the packaged runtime, not the source tree.
const visited = new Set();
async function checkGraph(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolve(file, '..', match[1]);
    assert.ok(target.startsWith(root + '/'), 'Import outside runtime: ' + target);
    await checkGraph(target);
  }
}
await checkGraph(resolve(root, 'server/index.js'));
const assets = await import(pathToFileURL(resolve(root, 'worker/assets.js')));
assert.ok(assets.ASSETS['/'].includes((await readFile(resolve(root, 'VERSION'), 'utf8')).trim()));
assert.ok(assets.ASSETS['/udp-client.js']);
assert.ok(Array.isArray(assets.OFFICE_SOLIDS));
console.log('Node artifact: ESM syntax, local imports, UDP assets and runtime manifest valid.');
console.log('Dependencies, native UDP and deployment require separate runtime checks.');
