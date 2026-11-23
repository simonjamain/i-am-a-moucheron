// `npm run format:check` dans `npm test` : une mise en forme oubliée échoue dans la
// boucle locale de l'agent, pas seulement en CI après un aller-retour de PR.
// Même commande que le script npm (une seule définition des fichiers vérifiés).
import { spawnSync } from 'node:child_process';

const run = spawnSync('npm', ['run', '--silent', 'format:check'], { stdio: 'inherit' });
if (run.status !== 0) {
  console.error('Mise en forme : lancer `npm run format` puis relancer le test.');
  process.exit(run.status ?? 1);
}
