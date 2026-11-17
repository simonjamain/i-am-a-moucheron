// Load server/game.js as it was at a baseline commit, for CPU comparisons.
// Source modules the baseline imports but that were removed since (the
// malicious annexes, for instance) are restored from the same commit, beside
// the temporary copy; every temporary file is deleted after import.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';

export async function loadBaselineGame(baseline, tag) {
  const show = (path) => execFileSync('git', ['show', baseline + ':' + path], { encoding: 'utf8' });
  const temporary = new URL(`../server/.${tag}-baseline-benchmark.mjs`, import.meta.url);
  const restored = [temporary];
  const source = show('server/game.js').replace(
    /from '\.\.\/src\/([\w-]+)\.js'/g,
    (statement, name) => {
      if (existsSync(new URL('../src/' + name + '.js', import.meta.url))) return statement;
      const copy = new URL(`../server/.${tag}-baseline-${name}.mjs`, import.meta.url);
      writeFileSync(copy, show('src/' + name + '.js'));
      restored.push(copy);
      return `from './.${tag}-baseline-${name}.mjs'`;
    },
  );
  // RAID_* left layout.js with the plans; the baseline only copies a number into its snapshot.
  writeFileSync(
    temporary,
    source.replace(
      /import \{ OFFICE_LAYOUT, RAID_DURATION \} from '\.\.\/src\/layout\.js';/,
      "import { OFFICE_LAYOUT } from '../src/layout.js';\nconst RAID_DURATION = 0;",
    ),
  );
  try {
    return (await import(temporary.href)).Game;
  } finally {
    for (const file of restored) unlinkSync(file);
  }
}
