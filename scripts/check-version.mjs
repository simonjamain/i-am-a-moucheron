import { execFileSync } from 'node:child_process';
export function validVersion(current, previous) {
  return /^\d+\n?$/.test(current) && Number(current) > Number(previous);
}
// Local (pre-commit): VERSION indexé contre HEAD.
// CI (PR): `--base <ref>` compare le VERSION de HEAD à celui de la branche cible.
const baseAt = process.argv.indexOf('--base');
const base = baseAt > 0 ? process.argv[baseAt + 1] : null;
if (baseAt > 0 && !base) {
  console.error('--base exige une référence git.');
  process.exit(2);
}
const show = (spec) => execFileSync('git', ['show', spec], { encoding: 'utf8' });
const current = show(base ? 'HEAD:VERSION' : ':VERSION');
const previous = show(base ? `${base}:VERSION` : 'HEAD:VERSION');
if (!validVersion(current, previous)) {
  console.error(
    `VERSION doit être un entier supérieur à ${base ?? 'HEAD'}, même pour un commit documentaire.`,
  );
  process.exitCode = 1;
}
