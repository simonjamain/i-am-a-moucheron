// Version et nouveautés déduites de l'historique Git, dans un dépôt jetable.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInfo, parseFragment, renderRecent, writeBuildInfo } from './build-info.ts';

assert.deepEqual(parseFragment('# note\n\n- Un.\n  Deux.  \n* Trois.\n'), [
  'Un.',
  'Deux.',
  'Trois.',
]);

const repo = mkdtempSync(join(tmpdir(), 'moucheron-build-info-'));
try {
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  const commit = (message, files = {}) => {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(repo, name, '..'), { recursive: true });
      writeFileSync(join(repo, name), text);
    }
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD').trim();
  };
  const base = commit('base');
  const baseline = { commit: base, version: 430 };
  const info = (extra = {}) => buildInfo({ cwd: repo, baseline, ...extra });

  assert.equal(info().version, 430, 'le commit de référence porte son propre numéro');
  commit('technique');
  assert.equal(info().version, 431);
  commit('feature a', { 'changelog.d/a-1111.md': 'Premier changement.\nSecond changement.\n' });
  commit('technique 2');
  commit('feature b', { 'changelog.d/b-2222.md': '# note\nChangement b.\n' });
  commit('feature c, même version que d?', { 'changelog.d/c-3333.md': '- Changement c.\n' });
  const out = info();
  assert.equal(out.version, 435);
  assert.deepEqual(out.entries, [
    { version: 435, changes: ['Changement c.'] },
    { version: 434, changes: ['Changement b.'] },
    { version: 432, changes: ['Premier changement.', 'Second changement.'] },
  ]);

  // Une branche réutilisée : deux fragments ajoutés dans le même commit partagent la version.
  commit('deux fragments', {
    'changelog.d/d-4444.md': 'D.\n',
    'changelog.d/e-5555.md': 'E.\n',
  });
  assert.deepEqual(info().entries[0], { version: 436, changes: ['D.', 'E.'] });
  // Un fragment non commité est rattaché à la version courante, jamais au futur.
  writeFileSync(join(repo, 'changelog.d/f-6666.md'), 'F.\n');
  const dirty = info();
  assert.equal(dirty.entries[0].version, dirty.version);
  assert.deepEqual(dirty.entries[0].changes, ['D.', 'E.', 'F.']);
  // README et fichiers non .md ne sont pas des fragments.
  writeFileSync(join(repo, 'changelog.d/README.md'), '# doc\nTexte.\n');
  writeFileSync(join(repo, 'changelog.d/notes.txt'), 'Texte.\n');
  assert.deepEqual(info().entries[0].changes, ['D.', 'E.', 'F.']);
  // Un fragment supprimé disparaît de l'affichage.
  git('rm', '-q', 'changelog.d/a-1111.md');
  assert.ok(!info().entries.some((e) => e.version === 432));

  // Historique incomplet : tolérant par défaut, refusé en mode strict.
  const lost = { commit: 'f'.repeat(40), version: 430 };
  const quiet = console.warn;
  console.warn = () => {};
  try {
    assert.equal(buildInfo({ cwd: repo, baseline: lost }).version, 430);
    assert.equal(buildInfo({ cwd: repo, baseline: lost }).exact, false);
  } finally {
    console.warn = quiet;
  }
  assert.throws(() => buildInfo({ cwd: repo, baseline: lost, strict: true }), /incomplet/);

  // Écriture des fichiers générés.
  mkdirSync(join(repo, 'src'));
  writeBuildInfo({ cwd: repo, baseline });
  assert.equal(readFileSync(join(repo, 'VERSION'), 'utf8'), '436\n');
  assert.match(readFileSync(join(repo, 'src/changelog-recent.ts'), 'utf8'), /RECENT_CHANGELOG/);
} finally {
  rmSync(repo, { recursive: true, force: true });
}

// Hors dépôt Git (build Docker) : les fichiers déjà générés suffisent, sinon erreur claire.
const bare = mkdtempSync(join(tmpdir(), 'moucheron-no-git-'));
try {
  assert.throws(() => writeBuildInfo({ cwd: bare }), /avant la construction/);
  mkdirSync(join(bare, 'src'));
  writeFileSync(join(bare, 'VERSION'), '500\n');
  writeFileSync(join(bare, 'src/changelog-recent.ts'), renderRecent([]));
  assert.equal(writeBuildInfo({ cwd: bare }).version, 500);
} finally {
  rmSync(bare, { recursive: true, force: true });
}
console.log(
  'Build info: version from commit count, fragments dated by the commit that added them.',
);
