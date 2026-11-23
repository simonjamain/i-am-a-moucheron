// `npm run check:docs` dans `npm test` : un lien Markdown local cassé échoue dans la
// boucle locale, avant le site strict de la CI (`Docs site`).
import { spawnSync } from 'node:child_process';

const run = spawnSync('npm', ['run', '--silent', 'check:docs'], { encoding: 'utf8' });
process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(run.stdout.split('\n').at(-2));
