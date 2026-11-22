// Runs the regression suite (scripts/suite.mjs) after assembling the assets.
//
//   npm test                     every script, in parallel; summary of all failures
//   npm test -- castor ground    only scripts whose name contains a fragment
//   npm test -- --bail           start no new script after the first failure
//   npm test -- --jobs=1         one script at a time (default: one per CPU)
//   npm test -- --list           print the suite without running it
//
// Each script runs in its own Node process. Scripts are independent: servers listen
// on port 0 or on distinct fixed UDP ranges, temporary files go to mkdtemp. Each
// script's output is buffered and printed whole when it ends, so parallel runs stay
// readable; the runner exits non-zero if any script exits non-zero or is killed.
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';

// Runs `files` (paths to Node scripts) with at most `jobs` at once.
// Resolves to [{ file, status, signal, ms, output }] in completion order.
export async function runScripts(files, { jobs = 1, bail = false, onDone = () => {} } = {}) {
  const queue = [...files];
  const results = [];
  let failed = false;
  const one = (file) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const child = spawn(process.execPath, [file], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chunks = [];
      child.stdout.on('data', (c) => chunks.push(c));
      child.stderr.on('data', (c) => chunks.push(c));
      child.on('error', (error) => chunks.push(Buffer.from(String(error) + '\n')));
      child.on('close', (status, signal) =>
        resolve({
          file,
          status,
          signal,
          ms: Math.round(performance.now() - t0),
          output: Buffer.concat(chunks).toString(),
        }),
      );
    });
  const worker = async () => {
    while (queue.length && !(bail && failed)) {
      const result = await one(queue.shift());
      if (result.status !== 0) failed = true;
      results.push(result);
      onDone(result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, files.length)) }, worker));
  return results;
}

async function main() {
  const { SUITE } = await import('./suite.mjs');
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const filters = args.filter((a) => !a.startsWith('--'));
  const jobsFlag = args.find((a) => a.startsWith('--jobs='));
  const jobs = jobsFlag ? Number(jobsFlag.slice('--jobs='.length)) : availableParallelism();
  if (!Number.isInteger(jobs) || jobs < 1) {
    console.error('--jobs=N expects a positive integer');
    process.exit(2);
  }
  const selected = filters.length ? SUITE.filter((n) => filters.some((f) => n.includes(f))) : SUITE;
  if (flags.has('--list')) {
    console.log(selected.join('\n'));
    process.exit(0);
  }
  if (!selected.length) {
    console.error('No suite script matches: ' + filters.join(', '));
    process.exit(2);
  }

  const assembled = spawnSync(process.execPath, ['scripts/assemble.mjs'], { stdio: 'inherit' });
  if (assembled.status !== 0) process.exit(assembled.status ?? 1);

  const started = performance.now();
  const results = await runScripts(
    selected.map((n) => `scripts/${n}.mjs`),
    {
      jobs,
      bail: flags.has('--bail'),
      onDone: (r) => {
        process.stdout.write(r.output);
        if (r.status !== 0) console.error(`✗ ${r.file} (exit ${r.status ?? r.signal}, ${r.ms} ms)`);
      },
    },
  );
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log(`\nSlowest: ${slowest.map((r) => `${r.file.slice(8, -4)} ${r.ms} ms`).join(', ')}`);
  const failures = results.filter((r) => r.status !== 0);
  const skipped = selected.length - results.length;
  if (failures.length) {
    console.error(
      `\n${failures.length}/${selected.length} script(s) failed in ${seconds} s (${jobs} job(s))` +
        (skipped ? `, ${skipped} not started (--bail)` : '') +
        ':',
    );
    console.error(failures.map((r) => `  node ${r.file}`).join('\n'));
    process.exit(1);
  }
  console.log(`\n${selected.length} suite script(s) passed in ${seconds} s (${jobs} job(s)).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
