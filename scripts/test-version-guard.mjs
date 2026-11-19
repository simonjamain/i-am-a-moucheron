// Garde de version, exercée dans un dépôt jetable : mode index/HEAD (pre-commit) et
// mode `--base <ref>` (CI des PR).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const repo = mkdtempSync(join(tmpdir(), 'moucheron-version-'));
const check = resolve('scripts/check-version.mjs');
const run = (...args) =>
  execFileSync(process.execPath, [check, ...args], { cwd: repo, stdio: 'pipe' });
try {
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  const setVersion = (v) => {
    writeFileSync(join(repo, 'VERSION'), v);
    git('add', 'VERSION');
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  setVersion('36\n');
  git('commit', '-m', 'baseline');
  assert.throws(() => run(), 'sans incrément');
  setVersion('37\n');
  run();
  git('commit', '-m', 'concurrent baseline');
  assert.throws(() => run(), 'ancien numéro après synchronisation');
  setVersion('38\n');
  run();
  setVersion('abc\n');
  assert.throws(() => run(), 'non entier');
  // Mode CI : HEAD (PR) contre la branche cible.
  git('checkout', '-b', 'pr');
  assert.throws(() => run('--base', 'main'), 'PR sans incrément');
  setVersion('38\n');
  git('commit', '-m', 'bump');
  run('--base', 'main');
  assert.throws(() => run('--base', 'pr'), 'égal à la base');
  assert.throws(() => run('--base'), 'référence manquante');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
console.log(
  'Version guard: index/HEAD and --base modes reject missing, equal and invalid versions.',
);
