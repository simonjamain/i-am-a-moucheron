import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
const skipped = new Set(['.git', '.local', 'node_modules', 'vendor', 'dist', 'outputs']);
async function walk(dir = '.') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(name)));
    else if (name.endsWith('.md')) found.push(name);
  }
  return found;
}
const files = (await walk()).sort(),
  errors = [];
for (const file of files) {
  const text = (await readFile(file, 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) continue;
    try {
      await access(path.resolve(path.dirname(file), decodeURIComponent(link)));
    } catch {
      errors.push(`${file}: ${link}`);
    }
  }
}
console.log(`Markdown inventory: ${files.length} files\n` + files.join('\n'));
if (errors.length) {
  console.error('Broken local links:\n' + errors.join('\n'));
  process.exitCode = 1;
} else
  console.log('All local Markdown links resolve. Semantic review remains required by AGENTS.md.');
