// Two real Chromium clients over local UDP; inject a fall into Alpha and
// observe the actual remote character updater on Bravo. Rendering is suppressed
// in this state/transport check to keep software GPU load out of timing; inspect
// visual quality separately. Test injection never enters the shipped client.
//   node scripts/assemble.mjs && node scripts/e2e-game-polish.mjs [bind-ip]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGameServer } from '../server/index.js';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(
    process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright',
  ));
}
const bindAddress = process.argv[2] || '127.0.0.1';
const app = createGameServer({ portBegin: 43100, portEnd: 43199, bindAddress });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + app.server.address().port + '/';
const browser = await chromium.launch({
  args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (test, ms, label) => {
  const start = Date.now();
  while (!(await test())) {
    if (Date.now() - start > ms) throw Error('Timeout: ' + label);
    await sleep(50);
  }
};
// Test harness: complete ICE gathering after the first candidate (see
// e2e-browser-resume.mjs).
const harness = () => {
  const Native = RTCPeerConnection;
  globalThis.RTCPeerConnection = class extends Native {
    constructor(...args) {
      super(...args);
      this.gathered = false;
      this.addEventListener('icecandidate', (e) => {
        if (e.candidate && !this.gathered)
          setTimeout(() => {
            this.gathered = true;
            this.dispatchEvent(new Event('icegatheringstatechange'));
          }, 300);
      });
    }
    get iceGatheringState() {
      return this.gathered ? 'complete' : super.iceGatheringState;
    }
  };
};
try {
  const pages = [];
  for (const name of ['Alpha', 'Bravo']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.route('**/client.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `\nrenderer.render = () => {}; globalThis.polishTest = { self: () => selfBase(), id: () => id, record(peer) { const g = basePeople.get(peer); if (!g) return false; const original = g.userData.animate; globalThis.phases = []; g.userData.animate = (dt, state) => { original(dt, state); const phase = state.parachute ? 'parachute' : state.falling ? 'fall' : g.userData.character.gait() === 'idle' ? 'landing' : 'locomotion'; if (phases.at(-1) !== phase) phases.push(phase); }; return true; } };`,
      });
    });
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.addInitScript(harness);
    await page.goto(url);
    await page.fill('#name', name);
    await page.fill('#code', 'E2EMOTION');
    await page.click('#join');
    await until(
      async () => /^● UDP · /.test((await page.textContent('#net'))?.trim() || ''),
      30000,
      name + ' joins over UDP',
    );
    console.log(name + ' joined over UDP');
    pages.push(page);
  }
  const room = app.game.rooms.get('E2EMOTION');
  const ids = [...room.pilots.keys()];
  assert.equal(ids.length, 2);
  const alpha = ids.find((id) => room.pilots.get(id).name === 'Alpha');
  await until(
    () => pages[1].evaluate((peer) => polishTest.record(peer), alpha),
    10000,
    'remote character model',
  );
  await pages[0].evaluate(() => {
    const b = polishTest.self();
    b.y += 0.12;
    b.vy = 0;
    b.grounded = false;
    b.parachute = false;
  });
  await until(() => pages[1].evaluate(() => phases.includes('fall')), 10000, 'remote freefall');
  await pages[0].evaluate(() => {
    const b = polishTest.self();
    b.parachute = true;
  });
  await until(
    () => pages[1].evaluate(() => phases.includes('parachute')),
    10000,
    'remote suspended descent',
  );
  await until(
    () => pages[1].evaluate(() => phases.lastIndexOf('landing') > phases.indexOf('parachute')),
    30000,
    'remote touchdown',
  );
  const phases = await pages[1].evaluate(() => globalThis.phases);
  assert.ok(
    phases.indexOf('fall') < phases.indexOf('parachute') &&
      phases.indexOf('parachute') < phases.lastIndexOf('landing'),
    JSON.stringify(phases),
  );
  console.log('Remote character phases over UDP:', phases);
  await pages[0].evaluate(() => {
    const b = polishTest.self();
    b.y += 0.005;
    b.vy = 0;
    b.grounded = false;
    b.parachute = false;
  });
  await until(
    () => pages[1].evaluate(() => phases.filter((p) => p === 'fall').length >= 2),
    10000,
    'second freefall without canopy',
  );
  await until(
    () => pages[1].evaluate(() => phases.lastIndexOf('landing') > phases.lastIndexOf('fall')),
    10000,
    'surviving freefall touchdown',
  );
  assert.equal(room.pilots.get(alpha).life, 'alive', 'short drop without parachute survives');
  console.log('Remote landing after surviving a drop without parachute: passed');
  for (const page of pages) assert.deepEqual(page.errors, [], 'no page error');
} finally {
  await browser.close();
  await app.close();
}
