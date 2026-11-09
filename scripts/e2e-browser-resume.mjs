// Manual end-to-end check (not part of npm test): a real Chromium joins a local
// UDP server, the server drops the connection, and the browser must resume the
// same pilot over a new connection. Then 'pagehide' must release the pilot.
//   node scripts/assemble.mjs && node scripts/e2e-browser-resume.mjs [bind-ip]
// bind-ip: an address of this machine reachable by Chromium's host candidate
// (default 127.0.0.1). Needs Playwright with its Chromium.
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
const app = createGameServer({ portBegin: 43000, portEnd: 43099, bindAddress });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
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
  return Date.now() - start;
};
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Some sandboxed Chromium builds find their UDP host candidate but never
  // report gathering as complete. Report it shortly after the first candidate,
  // as a normal machine would. The game code itself is unchanged.
  await page.addInitScript(() => {
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
  });
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/');
  await page.fill('#name', 'Testeur');
  await page.fill('#code', 'E2E');
  await page.click('#join');
  const net = async () => (await page.textContent('#net'))?.trim() || '';
  await until(async () => /^● UDP · /.test(await net()), 30000, 'join over UDP');
  const room = app.game.rooms.get('E2E');
  const [pilot] = room.pilots.keys();
  await sleep(1000);
  const dropped = new Set(app.connections);
  for (const c of dropped) c.pc.close();
  // Wait for a new connection: the dropped one may still be listed briefly.
  const resumedAfter = await until(
    async () =>
      app.connections.size === 1 &&
      !dropped.has([...app.connections][0]) &&
      [...app.connections][0].session.player?.id === pilot &&
      /^● UDP · /.test(await net()),
    20000,
    'resume after drop',
  );
  assert.equal(room.pilots.size, 1, 'no second pilot');
  assert.ok(room.pilots.has(pilot), 'the same pilot is resumed');
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await until(async () => !room.pilots.has(pilot), 3000, 'leave on pagehide');
  assert.deepEqual(errors, []);
  console.log(
    'Browser resume: same pilot ' + resumedAfter + ' ms after a server-side drop; pagehide leaves.',
  );
} finally {
  await browser.close();
  await app.close();
}
