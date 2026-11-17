// TypeScript migration guard rails (docs/typescript.md):
// 1. the type check passes;
// 2. no module exists both as .js and .ts;
// 3. every assembled asset coming from a .ts source is plain JavaScript.
// (Suite wiring is checked by scripts/test-suite-wiring.mjs.)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ASSETS } from '../worker/assets.js';

const tsc = path.resolve('node_modules/.bin/tsc');
assert.ok(existsSync(tsc), 'TypeScript is a dev dependency: run npm ci');
execFileSync(tsc, ['-p', 'tsconfig.json'], { stdio: 'inherit' });

const tsModules = [];
for (const dir of ['src', 'server']) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts')) continue;
    const twin = path.join(dir, file.replace(/\.ts$/, '.js'));
    assert.ok(!existsSync(twin), 'Both .js and .ts exist: ' + twin);
    if (dir === 'src') tsModules.push(file.replace(/\.ts$/, ''));
  }
}

// Served URLs keep `.js`; their content must have no type syntax left.
const scratch = mkdtempSync(path.join(tmpdir(), 'moucheron-ts-'));
try {
  let checked = 0;
  for (const name of tsModules) {
    const source = ASSETS['/' + name + '.js'];
    if (source === undefined) continue; // Node-only module (not served to browsers).
    const file = path.join(scratch, name + '.mjs');
    writeFileSync(file, source);
    execFileSync(process.execPath, ['--check', file]);
    checked++;
  }
  console.log(
    `TypeScript: tsc clean, ${tsModules.length} .ts module(s) in src/, ${checked} served as plain JS`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
