import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
export function validVersion(current, previous) {
  return /^\d+\n?$/.test(current) && Number(current) > Number(previous);
}
const current = execFileSync('git', ['show', ':VERSION'], { encoding: 'utf8' });
const previous = execFileSync('git', ['show', 'HEAD:VERSION'], { encoding: 'utf8' });
if (!validVersion(current, previous)) {
  console.error('VERSION doit être un entier supérieur à HEAD, même pour un commit documentaire.');
  process.exitCode = 1;
}
