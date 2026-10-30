import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const versions = [Number(readFileSync('VERSION', 'utf8'))];
for (const ref of ['HEAD', 'origin/main']) {
  try {
    versions.push(
      Number(
        execFileSync('git', ['show', ref + ':VERSION'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ),
    );
  } catch {}
}
const version = Math.max(35, ...versions.filter(Number.isFinite)) + 1;
writeFileSync('VERSION', version + '\n');
console.log(version);
