// The audio library (src/audio/) must stay extractable: it imports only its own
// files and Three.js types, never game code or a runtime 'three'.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'src/audio/';
const files = readdirSync(dir);
assert.ok(files.includes('index.ts'), 'src/audio/index.ts is the public entry');
let imports = 0;
for (const file of files) {
  assert.match(file, /\.ts$/, dir + file + ' must be TypeScript');
  const source = readFileSync(dir + file, 'utf8');
  for (const match of source.matchAll(
    /^\s*(import|export)\s+(type\s+)?[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm,
  )) {
    imports++;
    const [statement, , typeOnly, target] = match;
    if (target === 'three') {
      assert.ok(typeOnly, dir + file + ': three may only be imported as types: ' + statement);
      continue;
    }
    assert.match(
      target,
      /^\.\/[a-z-]+\.ts$/,
      dir + file + ' imports outside the library: ' + target,
    );
    assert.ok(files.includes(target.slice(2)), dir + file + ': missing ' + target);
  }
  assert.doesNotMatch(source, /\bimport\s*\(/, dir + file + ': no dynamic import');
  assert.doesNotMatch(source, /globalThis\.(MOUCHERON|game)/i, dir + file + ': no game globals');
}
assert.ok(imports > 0);
console.log(
  'Audio library boundary: ' + files.length + ' files, ' + imports + ' imports, no game code',
);
