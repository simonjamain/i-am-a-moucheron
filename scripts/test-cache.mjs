import './normal-dossiers.mjs';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/index.js';
const app = createGameServer({ muxPort: 45010, bindAddress: '127.0.0.1' });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + app.server.address().port;
const get = (path, init) => fetch(origin + path, init);
const page = await get('/');
assert.equal(page.headers.get('cache-control'), 'no-cache');
const version = page.headers.get('x-game-version');
assert.match(version, /^[a-f0-9]{12}$/);
const html = await page.text();
assert.ok(html.includes('/assets/' + version + '/boot.js'));
for (const file of [
  'client',
  'changelog',
  'aircraft-fire',
  'insect-hits',
  'three',
  'control-focus',
  'base',
  'layout',
  'office',
  'graphics',
  'renderer',
  'network',
  'audio/index',
  'audio/manager',
  'game-audio/game-sound',
  'flight',
  'input',
  'purgatory-physics',
  'mouse-flight',
]) {
  const response = await get('/assets/' + version + '/' + file + '.js');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public,max-age=31536000,immutable');
  assert.equal(response.headers.get('x-game-version'), version);
  const source = await response.text();
  for (const match of source.matchAll(/\bfrom\s*['"](\.?\.?\/[^'"]+\.js[^'"]*)['"]/g))
    assert.ok(
      match[1].startsWith('/assets/' + version + '/'),
      'all imports share the current version: ' + match[1],
    );
}
assert.equal((await get('/client.js', { headers: { 'If-None-Match': '*' } })).status, 200);
console.log(
  'PASS: revalidated HTML, immutable fingerprinted module graph, legacy aliases revalidated and expired fingerprints rejected',
);

assert.equal((await get('/client.js')).headers.get('cache-control'), 'no-cache');
const expired = await get('/assets/000000000000/client.js');
assert.equal(expired.status, 410);
assert.equal(expired.headers.get('cache-control'), 'no-store');
app.server.close();
app.server.closeAllConnections?.();
process.exit(0);
