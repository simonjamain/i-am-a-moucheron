// Numéro de version et nouveautés récentes, déduits de l'historique Git.
//
//   node scripts/build-info.ts [--strict]
//
// - Version = BASELINE.version + nombre de commits (première parentée) depuis
//   BASELINE.commit. Les PR sont fusionnées en squash : une PR = un commit = un numéro.
// - Nouveautés = fragments `changelog.d/*.md` ; la version d'un fragment est celle du
//   commit qui l'a ajouté. Aucun numéro n'est écrit à la main, donc aucun conflit.
// Écrit `VERSION` et `src/changelog-recent.ts`, deux fichiers générés (ignorés par Git).
// Hors dépôt Git (build Docker), vérifie seulement que ces fichiers existent.
// Voir docs/changelog.md.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Dernier commit numéroté à la main (VERSION 430) : tout ce qui suit est compté.
export const BASELINE = {
  commit: 'c6d0d5f9c5acea1f975449ceaf9532e4e0ed41f0',
  version: 437,
};
export const FRAGMENT_DIR = 'changelog.d';
export const MAX_CHANGE_LENGTH = 130;

export interface RecentEntry {
  version: number;
  changes: string[];
}
export interface BuildInfo {
  version: number;
  entries: RecentEntry[];
  /** Vrai si le numéro est exact (historique complet), faux dans un clone partiel. */
  exact: boolean;
}
export interface BuildOptions {
  cwd?: string;
  baseline?: { commit: string; version: number };
  strict?: boolean;
}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** Une ligne par nouveauté ; `#` commente ; un tiret initial est toléré. */
export function parseFragment(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/^[-*]\s+/, ''));
}

export function isFragmentName(name: string): boolean {
  return name.endsWith('.md') && name.toLowerCase() !== 'readme.md';
}

export function buildInfo({
  cwd = '.',
  baseline = BASELINE,
  strict = false,
}: BuildOptions = {}): BuildInfo {
  const dir = join(cwd, FRAGMENT_DIR);
  const names = existsSync(dir) ? readdirSync(dir).filter(isFragmentName).sort() : [];
  let ranks: Map<string, number> | null = null;
  try {
    git(cwd, 'cat-file', '-e', baseline.commit + '^{commit}');
    const shas = git(cwd, 'rev-list', '--first-parent', '--reverse', baseline.commit + '..HEAD')
      .split('\n')
      .filter(Boolean);
    ranks = new Map(shas.map((sha, i) => [sha, i + 1]));
  } catch {}
  if (!ranks) {
    if (strict)
      throw Error(
        `Historique Git incomplet : le commit de référence ${baseline.commit.slice(0, 8)} est ` +
          'introuvable (clone superficiel ? utiliser `git fetch --unshallow` ou fetch-depth: 0).',
      );
    console.warn(
      `build-info : historique incomplet, version ${baseline.version} par défaut ` +
        '(dev uniquement ; la CI exige un historique complet).',
    );
  }
  const version = baseline.version + (ranks?.size ?? 0);

  // Commit (première parentée) qui a ajouté chaque fragment encore présent.
  const added = new Map<string, number>();
  if (ranks && names.length) {
    const log = git(
      cwd,
      'log',
      '--first-parent',
      '--diff-filter=A',
      '--name-only',
      '--format=%x00%H',
      baseline.commit + '..HEAD',
      '--',
      FRAGMENT_DIR,
    );
    for (const block of log.split('\0').filter(Boolean)) {
      const [sha, ...files] = block.split('\n').filter(Boolean);
      const rank = ranks.get(sha);
      if (rank === undefined) continue;
      for (const file of files) added.set(file.slice(FRAGMENT_DIR.length + 1), rank);
    }
  }

  const byVersion = new Map<number, string[]>();
  for (const name of names) {
    const changes = parseFragment(readFileSync(join(dir, name), 'utf8'));
    if (!changes.length) continue;
    // Non encore commité (ou historique incomplet) : rattaché à la version courante.
    const v = Math.min(version, baseline.version + (added.get(name) ?? version - baseline.version));
    byVersion.set(v, [...(byVersion.get(v) ?? []), ...changes]);
  }
  const entries = [...byVersion]
    .sort((a, b) => b[0] - a[0])
    .map(([v, changes]) => ({ version: v, changes }));
  return { version, entries, exact: ranks !== null };
}

export function renderRecent(entries: RecentEntry[]): string {
  return (
    '// Généré par scripts/build-info.ts depuis changelog.d/ : ne pas éditer ni committer.\n' +
    'export const RECENT_CHANGELOG = ' +
    JSON.stringify(entries, null, 2) +
    ';\n'
  );
}

export function writeBuildInfo(options: BuildOptions = {}): BuildInfo {
  const cwd = options.cwd ?? '.';
  const inGit = (() => {
    try {
      git(cwd, 'rev-parse', '--git-dir');
      return true;
    } catch {
      return false;
    }
  })();
  const files = [join(cwd, 'VERSION'), join(cwd, 'src/changelog-recent.ts')];
  if (!inGit) {
    // Contexte Docker : les fichiers ont été générés avant la construction.
    const missing = files.filter((f) => !existsSync(f));
    if (missing.length)
      throw Error(
        'Pas de dépôt Git et fichiers générés absents (' +
          missing.join(', ') +
          ') : lancer `node scripts/build-info.ts` avant la construction.',
      );
    return { version: Number(readFileSync(files[0], 'utf8')), entries: [], exact: true };
  }
  const info = buildInfo(options);
  writeFileSync(files[0], info.version + '\n');
  writeFileSync(files[1], renderRecent(info.entries));
  return info;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = writeBuildInfo({ strict: process.argv.includes('--strict') });
  console.log(`version ${info.version}, ${info.entries.length} version(s) de nouveautés récentes`);
}
