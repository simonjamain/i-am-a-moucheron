// Prepare the source of the documentation site (GitHub Pages, MkDocs Material).
// The repository Markdown stays the single reference: this script only stages a
// copy in `.site/src`, rewrites links for the site layout and generates pages
// (player changelog, visual gallery, documentation health, live UI review).
// Usage: node scripts/build-site.mjs, then `mkdocs build --strict`. See docs/site.md.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PLAYER_CHANGELOG } from '../src/changelog.js';

const OUT = '.site/src';
const REPO_URL = 'https://github.com/simonjamain/i-am-a-moucheron';
const ROOT_PAGES = {
  'README.md': 'projet.md',
  'CONTRIBUTING.md': 'contribuer.md',
  'AGENTS.md': 'agents.md',
};
const IMAGE = /\.(png|jpe?g|svg|webp|gif)$/i;

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(name)));
    else found.push(name);
  }
  return found.sort();
}

// Repository path -> path inside the site source.
const docsFiles = await walk('docs');
const siteOf = new Map();
for (const [repo, site] of Object.entries(ROOT_PAGES)) siteOf.set(repo, site);
for (const file of docsFiles) {
  // The raw preview imports the game server modules; it is rebuilt under ui-review/.
  if (file === 'docs/ui-review.html') siteOf.set(file, 'ui-review/index.html');
  else siteOf.set(file, file.slice('docs/'.length));
}
const markdown = [...siteOf.keys()].filter((file) => file.endsWith('.md'));

const firstHeading = (text) => text.match(/^# (.+)$/m)?.[1].trim() ?? '';
const titles = new Map();
const incoming = new Map(markdown.map((file) => [file, new Set()]));
const codeLinks = new Map();

function rewrite(file, text) {
  const fromSite = path.posix.dirname(siteOf.get(file));
  let code = 0;
  // Leave fenced code untouched; rewrite inline Markdown links and images.
  const parts = text.split(/(```[\s\S]*?```)/g);
  const out = parts.map((part, index) => {
    if (index % 2) return part;
    return part.replace(
      /(!?\[[^\]]*\]\()([^\s)]+)((?:\s+"[^"]*")?\))/g,
      (all, open, target, close) => {
        const bare = target.replace(/^<|>$/g, '');
        if (
          !bare ||
          /^[a-z][a-z0-9+.-]*:/i.test(bare) ||
          bare.startsWith('//') ||
          bare.startsWith('#')
        )
          return all;
        const [link, hash] = bare.split('#');
        const repoPath = path.posix.normalize(
          path.posix.join(path.posix.dirname(file), decodeURIComponent(link)),
        );
        const anchor = hash ? '#' + hash : '';
        if (siteOf.has(repoPath)) {
          if (incoming.has(repoPath) && repoPath !== file) incoming.get(repoPath).add(file);
          let relative = path.posix.relative(fromSite, siteOf.get(repoPath));
          if (relative.endsWith('/index.html')) relative = relative.slice(0, -'index.html'.length);
          return open + relative + anchor + close;
        }
        if (!existsSync(repoPath)) return all;
        code++;
        const kind = all.startsWith('!') ? 'raw' : 'blob';
        return open + `${REPO_URL}/${kind}/main/${repoPath}` + anchor + close;
      },
    );
  });
  codeLinks.set(file, code);
  return out.join('');
}

await rm('.site', { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const [repo, site] of siteOf) {
  const target = path.posix.join(OUT, site);
  await mkdir(path.posix.dirname(target), { recursive: true });
  if (repo.endsWith('.md')) {
    const text = await readFile(repo, 'utf8');
    titles.set(repo, firstHeading(text) || repo);
    await writeFile(target, rewrite(repo, text));
  } else if (repo !== 'docs/ui-review.html') await copyFile(repo, target);
}

// Player changelog, from the same data as the in-game « Nouveautés » panel.
const changelog = [
  '# Nouveautés',
  '',
  'Les changements visibles en jeu, du plus récent au plus ancien. Le même historique',
  's’ouvre en jeu avec le numéro de version, en haut à gauche de l’accueil.',
  '',
  ...PLAYER_CHANGELOG.flatMap(({ version, changes }) => [
    `## Version ${version}`,
    '',
    ...changes.map((change) => `- ${change}`),
    '',
  ]),
];
await writeFile(path.posix.join(OUT, 'nouveautes.md'), changelog.join('\n'));

// Visual gallery: every image of docs/, with the pages that show it.
const images = docsFiles.filter((file) => IMAGE.test(file));
const usedBy = new Map(images.map((image) => [image, []]));
for (const file of markdown) {
  const text = await readFile(file, 'utf8');
  for (const image of images) {
    const relative = path.posix.relative(path.posix.dirname(file), image);
    if (text.includes(relative)) usedBy.get(image).push(file);
  }
}
const pageLink = (from, file) =>
  `[${titles.get(file)}](${path.posix.relative(path.posix.dirname(from), siteOf.get(file))})`;
const gallery = [
  '# Galerie visuelle',
  '',
  'Toutes les images de la documentation : planches de modèles, captures d’interface et',
  'références. Générée à chaque publication ; une image sans page liée est à rattacher',
  'ou à retirer.',
  '',
  ...images.flatMap((image) => {
    const site = siteOf.get(image);
    const pages = usedBy.get(image).map((file) => pageLink('galerie.md', file));
    return [
      `## ${path.posix.basename(image)}`,
      '',
      `![${path.posix.basename(image)}](${site}){ loading=lazy }`,
      '',
      pages.length ? `Utilisée par : ${pages.join(' · ')}` : '_Aucune page ne l’utilise._',
      '',
    ];
  }),
];
await writeFile(path.posix.join(OUT, 'galerie.md'), gallery.join('\n'));

// Live UI review: the real HUD/bank components with their browser modules, made
// relative so the page works under the GitHub Pages project path.
const { ASSETS } = await import('../server/assets.js');
// The server serves modules at `/<name>.js` and, once versioned, `/assets/<build>/<name>.js`.
const MODULE_URL = /(['"])\/(?:assets\/\w+\/)?([\w.-]+\.m?js)\1/g;
const relativeImports = (text) => text.replace(MODULE_URL, '$1./$2$1');
const reviewDir = path.posix.join(OUT, 'ui-review');
await mkdir(reviewDir, { recursive: true });
const pending = [...ASSETS['/ui-review.html'].matchAll(MODULE_URL)].map((m) => m[2]);
const copied = new Set();
while (pending.length) {
  const name = pending.pop();
  if (copied.has(name) || typeof ASSETS['/' + name] !== 'string') continue;
  copied.add(name);
  const source = ASSETS['/' + name];
  for (const match of source.matchAll(MODULE_URL)) pending.push(match[2]);
  await writeFile(path.posix.join(reviewDir, name), relativeImports(source));
}
await writeFile(
  path.posix.join(reviewDir, 'index.html'),
  relativeImports(ASSETS['/ui-review.html']),
);
const screens = [
  '# Écrans intégrés',
  '',
  'Les vrais composants du HUD, de la banque et du bon de commande, rendus avec le code',
  'du jeu sur des données de démonstration : ni partie multijoueur ni GPU nécessaires.',
  'Les boutons du haut changent de contexte ; les signatures agissent sur une caisse',
  'temporaire, réinitialisée au rechargement. Source : `scripts/build-ui-preview.mjs`.',
  '',
  '[Ouvrir en plein écran](../ui-review/){ .md-button }',
  '',
  '<iframe src="../ui-review/" title="Écrans intégrés" loading="lazy"',
  '  style="width:100%;aspect-ratio:16/10;border:1px solid var(--md-default-fg-color--lightest);border-radius:6px"></iframe>',
  '',
];
await writeFile(path.posix.join(OUT, 'ecrans.md'), screens.join('\n'));

// Documentation health: freshness, links and dated "lot" documents.
const nav = await readFile('mkdocs.yml', 'utf8');
const lastChange = (file) => {
  try {
    return (
      execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim() ||
      '—'
    );
  } catch {
    return '—';
  }
};
const dated = (title) => /\b(version|versions|lot|candidat|correctif)\b|issue #/i.test(title);
const rows = [];
let orphans = 0,
  outOfNav = 0,
  datedCount = 0;
for (const file of markdown) {
  const site = siteOf.get(file);
  const lines = (await readFile(file, 'utf8')).split('\n').length;
  const links = incoming.get(file).size;
  const inNav = nav.includes(': ' + site) || nav.includes('- ' + site);
  const flags = [];
  if (!links && file !== 'README.md') (flags.push('orphelin'), orphans++);
  if (!inNav) (flags.push('hors menu'), outOfNav++);
  if (dated(titles.get(file))) (flags.push('titre daté'), datedCount++);
  rows.push(
    `| ${pageLink('sante.md', file)} | ${lastChange(file)} | ${lines} | ${links} | ${codeLinks.get(file)} | ${flags.join(', ') || 'ok'} |`,
  );
}
const health = [
  '# Santé de la documentation',
  '',
  `Page générée à chaque publication depuis \`main\` : ${markdown.length} documents,`,
  `${orphans} orphelin(s) (aucune autre page n’y renvoie), ${outOfNav} hors du menu,`,
  `${datedCount} au titre daté (« version », « lot », « correctif »…), à reprendre dans une`,
  'référence thématique. Les liens cassés font échouer la publication.',
  '',
  'Colonnes : dernière modification Git, lignes, pages qui y renvoient, liens vers le code',
  '(ouverts sur GitHub).',
  '',
  '| Document | Modifié | Lignes | Renvois | Code | État |',
  '| --- | --- | ---: | ---: | ---: | --- |',
  ...rows,
  '',
];
await writeFile(path.posix.join(OUT, 'sante.md'), health.join('\n'));

console.log(
  `Site source ready in ${OUT}: ${markdown.length} documents, ${images.length} images, ` +
    `${copied.size} UI review modules.`,
);
