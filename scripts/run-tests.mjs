// Runs the regression suite (scripts/suite.mjs) after assembling the assets.
//
//   npm test                     every script, in order; summary of all failures
//   npm test -- castor ground    only scripts whose name contains a fragment
//   npm test -- --bail           stop at the first failure (previous behaviour)
//   npm test -- --list           print the suite without running it
//
// Each script still runs in its own Node process, exactly as before.
import { spawnSync } from 'node:child_process';
import { SUITE } from './suite.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const filters = args.filter((a) => !a.startsWith('--'));
const selected = filters.length ? SUITE.filter((n) => filters.some((f) => n.includes(f))) : SUITE;
if (flags.has('--list')) {
  console.log(selected.join('\n'));
  process.exit(0);
}
if (!selected.length) {
  console.error('No suite script matches: ' + filters.join(', '));
  process.exit(2);
}
const run = (script) =>
  spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });

const assembled = run('scripts/assemble.mjs');
if (assembled.status !== 0) process.exit(assembled.status ?? 1);

const failures = [];
const started = performance.now();
for (const name of selected) {
  const t0 = performance.now();
  const result = run(`scripts/${name}.mjs`);
  if (result.status !== 0) {
    failures.push(name);
    console.error(
      `✗ ${name} (exit ${result.status ?? result.signal}, ${Math.round(performance.now() - t0)} ms)`,
    );
    if (flags.has('--bail')) break;
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
if (failures.length) {
  console.error(`\n${failures.length}/${selected.length} script(s) failed in ${seconds} s:`);
  console.error(failures.map((n) => `  node scripts/${n}.mjs`).join('\n'));
  process.exit(1);
}
console.log(`\n${selected.length} suite script(s) passed in ${seconds} s.`);
