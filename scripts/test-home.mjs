// Issue #104: clean home screen, clickable version, validated names, no audio UI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VEHICLES } from '../src/fleet.js';
import { SHOP } from '../src/equipment.js';
import { FORTIFICATIONS } from '../src/ground-fortifications.js';

const html = readFileSync('src/index.html', 'utf8');
const client = readFileSync('src/client.js', 'utf8');
const office = readFileSync('src/office.js', 'utf8');
assert.match(html, /<h1>I am Moucheron<\/h1>/);
const home = html.slice(0, html.indexOf('</main>'));
for (const gone of [
  /class="mark"|✳/,
  /BUREAU DES AFFAIRES VOLANTES/i,
  /PROTOTYPE/i,
  /Petit avion/,
  /Coopération à échelle miniature/,
  /class="features"/,
])
  assert.ok(!gone.test(home), 'home screen still shows ' + gone);
for (const gone of [
  /id="audioControls"|id="soundToggle"|id="soundVolume"/,
  /id="gameVersion"/,
  /PROTOTYPE/,
])
  assert.ok(!gone.test(html), 'page still contains ' + gone);
assert.match(html, /Base Alpha/i, 'Base Alpha stays on the home screen');
assert.doesNotMatch(office, /BASE ALPHA · 3 \/ 1000/, 'no floating label in the 3D scene');
const versionButton = html.slice(
  html.indexOf('id="changelogOpen"') - 20,
  html.indexOf('</button>', html.indexOf('id="changelogOpen"')),
);
assert.match(versionButton, /v__GAME_VERSION__/, 'the version number opens the changelog');
assert.doesNotMatch(versionButton, /Nouveautés\s*$/);
// Issue #135: no "Recommencer la partie" nor room-name/share button in the HUD;
// the room still comes from the link (?room=) and stays in the address bar.
assert.doesNotMatch(html, /id="restartGame"|Recommencer la partie|id="share"|id="roomCode"/);
assert.doesNotMatch(client, /restartGame|\$\('share'\)|roomCode/);
assert.match(client, /history\.replaceState\(\{\}, '', '\?room=' \+ room\)/);
assert.match(client, /const audioSettings = \{ volume: 0\.55, muted: false \};/);
assert.doesNotMatch(client, /soundToggle|soundVolume|moucheron-audio/);
assert.match(
  client,
  /\['pointerdown', 'keydown'\][\s\S]{0,120}sound\.unlock\(\)/,
  'unlock on gesture',
);

assert.equal(VEHICLES.fighter.name, 'M1 Chasseur léger');
assert.equal(VEHICLES.bomber.name, 'B3 Bombardier moyen');
assert.equal(VEHICLES.helicopter.name, 'H2 Hélicoptère d’attaque au sol');
assert.equal(VEHICLES.tank.name, 'T3 Char moyen');
assert.equal(VEHICLES.castor.name, 'G1 Castor');
assert.equal(VEHICLES.flaktruck.name, 'D2 Anti-air mobile');
assert.equal(SHOP.dca.name, 'Canon Flak');
assert.equal(FORTIFICATIONS.antitank.name, 'Canon anti-matériel');
assert.equal(VEHICLES.spitfire.name, 'Spitfire S6', 'unvalidated names untouched');
console.log('Home: title, clickable version, no marketing/audio UI, validated names.');
