// Load server/game.js as it was at a baseline commit, for CPU comparisons.
// Source modules the baseline imports but that were removed since (the
// malicious annexes, for instance) are restored from the same commit, beside
// the temporary copy; every temporary file is deleted after import.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';

// The current file for a module the baseline imported as `src/<name>.js`: the
// same name in TypeScript once migrated (docs/typescript.md), or null if removed.
function currentModule(name) {
  for (const ext of ['.js', '.ts']) {
    const file = new URL('../src/' + name + ext, import.meta.url);
    if (existsSync(file)) return file;
  }
  return null;
}

export async function loadBaselineGame(baseline, tag) {
  const show = (path) => execFileSync('git', ['show', baseline + ':' + path], { encoding: 'utf8' });
  const temporary = new URL(`../server/.${tag}-baseline-benchmark.mjs`, import.meta.url);
  const restored = [temporary];
  const modules = new Map();
  for (const [, name] of show('server/game.js').matchAll(/from '\.\.\/src\/([\w-]+)\.js'/g)) {
    const file = currentModule(name);
    if (file) modules.set(name, await import(file.href));
  }
  // Names the baseline imports but that were removed since (waveStipend left
  // equipment.js with the wave bonus): the import drops them and a stub stands in.
  // The benchmarks only build snapshots, which never call them.
  const stubs = [];
  const raw = show('server/game.js');
  const trimmed = raw.replace(
    /import\s*\{([^}]*)\}\s*from '(\.\.\/src\/([\w-]+)\.js)'/g,
    (statement, names, path, name) => {
      const current = modules.get(name);
      if (!current) return statement;
      const kept = [];
      for (const raw of names.split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (!name) continue;
        if (name === 'RAID_DURATION' || name in current) kept.push(raw.trim());
        else stubs.push(name);
      }
      return `import { ${kept.join(', ')} } from '${path}'`;
    },
  );
  const source = trimmed.replace(/from '\.\.\/src\/([\w-]+)\.js'/g, (statement, name) => {
    const file = currentModule(name);
    if (file) return `from '../src/${file.pathname.split('/').pop()}'`;
    const copy = new URL(`../server/.${tag}-baseline-${name}.mjs`, import.meta.url);
    writeFileSync(copy, show('src/' + name + '.js'));
    restored.push(copy);
    return `from './.${tag}-baseline-${name}.mjs'`;
  });
  // RAID_* left layout.ts with the plans; the baseline only copies a number into its snapshot.
  writeFileSync(
    temporary,
    (stubs.length ? stubs.map((name) => `const ${name} = () => 0;\n`).join('') : '') +
      source.replace(
        /import \{ OFFICE_LAYOUT, RAID_DURATION \} from '\.\.\/src\/layout\.(?:js|ts)';/,
        "import { OFFICE_LAYOUT } from '../src/layout.ts';\nconst RAID_DURATION = 0;",
      ),
  );
  try {
    return (await import(temporary.href)).Game;
  } finally {
    for (const file of restored) unlinkSync(file);
  }
}
