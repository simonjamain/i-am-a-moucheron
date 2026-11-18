// Rename JavaScript modules to TypeScript and rewrite every reference to them.
//
//   node scripts/ts-migrate.mjs src/scale.js src/units.js [--dry-run]
//
// The rename is mechanical: types are added afterwards, then checked with
// `npm run typecheck`. References rewritten:
// - relative import specifiers in src/, server/, scripts/ (`./scale.js`, `../src/scale.js`);
// - repository-relative path strings used by tests (`'src/scale.js'`, `new URL('../src/scale.js', …)`);
// - Markdown mentions (`src/scale.js`, and a bare `scale.js` when that basename is unique).
// Browser URLs (`'/scale.js'` in client.js, the assembler's served URLs) stay `.js`:
// the assembler serves the stripped TypeScript at the same URL.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((a) => !a.startsWith('--')).map((a) => path.normalize(a));
if (!targets.length) {
  console.error('Usage: node scripts/ts-migrate.mjs src/<module>.js [...] [--dry-run]');
  process.exit(2);
}
for (const t of targets) {
  if (!/^(src|server)\/[^/]+\.js$/.test(t)) throw Error('Only src/*.js or server/*.js: ' + t);
  if (!existsSync(path.join(root, t))) throw Error('Missing module: ' + t);
  if (existsSync(path.join(root, t.replace(/\.js$/, '.ts')))) throw Error('Already exists: ' + t);
}
const migrated = new Set(targets);
const codeDirs = ['src', 'server', 'scripts'];
const skippedDirs = new Set(['node_modules', '.git', 'dist', 'vendor', 'archive']);

async function walk(dir, accept) {
  const out = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel, accept)));
    else if (accept(rel)) out.push(rel);
  }
  return out;
}

const codeFiles = (
  await Promise.all(codeDirs.map((d) => walk(d, (f) => /\.(m?js|ts)$/.test(f))))
).flat();
const docFiles = await walk('.', (f) => f.endsWith('.md'));

// Rewrite a quoted path when it designates a migrated module, either relative to
// the file (import specifiers, new URL) or to the repository root (test fixtures).
function rewriteCode(file, text) {
  const dir = path.dirname(file);
  return text.replace(/(['"`])((?:\.{1,2}\/|src\/|server\/)[^'"`\s]*?\.js)\1/g, (all, q, spec) => {
    const candidates = spec.startsWith('.')
      ? [path.normalize(path.join(dir, spec))]
      : [path.normalize(spec)];
    // `../src/x.js` inside scripts/ also appears in readFile calls relative to cwd.
    if (spec.startsWith('../')) candidates.push(path.normalize(spec.replace(/^\.\.\//, '')));
    return candidates.some((c) => migrated.has(c)) ? q + spec.replace(/\.js$/, '.ts') + q : all;
  });
}

const allBasenames = new Map();
for (const f of codeFiles.filter((f) => /^(src|server)\/[^/]+\.(js|ts)$/.test(f))) {
  const base = path.basename(f).replace(/\.ts$/, '.js');
  allBasenames.set(base, (allBasenames.get(base) ?? 0) + 1);
}
function rewriteDoc(text) {
  for (const t of migrated) {
    const ts = t.replace(/\.js$/, '.ts');
    text = text.replaceAll(t, ts);
    const base = path.basename(t);
    if (allBasenames.get(base) === 1)
      text = text.replace(
        new RegExp('(?<![\\w./-])' + base.replace(/[.]/g, '\\.') + '(?![\\w])', 'g'),
        base.replace(/\.js$/, '.ts'),
      );
  }
  return text;
}

const changed = [];
const self = path.relative(root, import.meta.filename);
for (const file of codeFiles.filter((f) => f !== self)) {
  const before = await readFile(path.join(root, file), 'utf8');
  const after = rewriteCode(file, before);
  if (after !== before) {
    changed.push(file);
    if (!dryRun) await writeFile(path.join(root, file), after);
  }
}
for (const file of docFiles) {
  const before = await readFile(path.join(root, file), 'utf8');
  const after = rewriteDoc(before);
  if (after !== before) {
    changed.push(file);
    if (!dryRun) await writeFile(path.join(root, file), after);
  }
}
for (const t of targets) {
  if (dryRun) continue;
  const ts = t.replace(/\.js$/, '.ts');
  try {
    execFileSync('git', ['mv', t, ts], { cwd: root, stdio: 'pipe' });
  } catch {
    const { rename } = await import('node:fs/promises');
    await rename(path.join(root, t), path.join(root, ts));
  }
}
console.log(
  (dryRun ? '[dry run] ' : '') +
    `Renamed ${targets.length} module(s); references updated in ${changed.length} file(s).`,
);
if (changed.length) console.log(changed.map((f) => '  ' + f).join('\n'));
console.log('Next: add types, then `npm run typecheck && npm test`.');
