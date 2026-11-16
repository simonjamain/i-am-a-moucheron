// Manual end-to-end check (not part of npm test): a real Chromium on a network
// where UDP never answers (the server announces an unreachable address, like a
// company firewall dropping outbound UDP) must fall back to TCP (WebSocket),
// play, resume over TCP after a drop without retrying UDP, and leave.
//   node scripts/assemble.mjs && node scripts/e2e-browser-tcp-fallback.mjs
// Needs Playwright with its Chromium.
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
// 192.0.2.1 (TEST-NET-1) is never routed: connectivity checks get no answer.
const app = createGameServer({
  portBegin: 43100,
  portEnd: 43199,
  bindAddress: '127.0.0.1',
  advertiseAddress: '192.0.2.1',
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
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
  // Same harness shim as e2e-browser-resume: sandboxed Chromium may never
  // report ICE gathering as complete. The game code itself is unchanged.
  await page.addInitScript(() => {
    const Native = RTCPeerConnection;
    globalThis.RTCPeerConnection = class extends Native {
      constructor(...args) {
        super(...args);
        this.gathered = false;
        setTimeout(() => {
          this.gathered = true;
          this.dispatchEvent(new Event('icegatheringstatechange'));
        }, 500);
      }
      get iceGatheringState() {
        return this.gathered ? 'complete' : super.iceGatheringState;
      }
    };
  });
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/');
  // The lobby is usable once the loading screen has left (see e2e-loading).
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.fill('#name', 'Bureau');
  await page.fill('#code', 'TCPE2E');
  const started = Date.now();
  await page.click('#join');
  const net = async () => (await page.textContent('#net'))?.trim() || '';
  await until(async () => /^● TCP \(SECOURS\) · /.test(await net()), 30000, 'join over TCP');
  const joinedAfter = Date.now() - started;
  const room = app.game.rooms.get('TCPE2E');
  const [pilot] = room.pilots.keys();
  assert.equal([...app.connections].filter((c) => c.transport === 'tcp').length, 1);
  // The game runs: its regular commands and motion keep arriving over TCP.
  const tcp = [...app.connections].find((c) => c.transport === 'tcp');
  const seen = { command: 0, motion: 0 };
  for (const kind of ['command', 'motion']) {
    const original = tcp.session[kind].bind(tcp.session);
    tcp.session[kind] = (raw) => {
      seen[kind]++;
      return original(raw);
    };
  }
  // Headless software WebGL is slow here: allow time for the first frames.
  await until(() => seen.command > 0 && seen.motion > 0, 20000, 'commands and motion over TCP');
  const dropped = new Set(app.connections);
  for (const c of dropped) c.close();
  const resumedAfter = await until(
    async () =>
      [...app.connections].some(
        (c) => !dropped.has(c) && c.transport === 'tcp' && c.session.player?.id === pilot,
      ) && /^● TCP \(SECOURS\) · /.test(await net()),
    20000,
    'resume over TCP',
  );
  assert.ok(resumedAfter < 4000, 'resume goes straight to TCP, without a new UDP attempt');
  assert.equal(room.pilots.size, 1, 'no second pilot');
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await until(async () => !room.pilots.has(pilot), 3000, 'leave on pagehide');
  assert.deepEqual(errors, []);
  console.log(
    'Browser TCP fallback: joined in ' +
      joinedAfter +
      ' ms (UDP abandoned after 5 s), resumed over TCP in ' +
      resumedAfter +
      ' ms, pagehide leaves.',
  );
} finally {
  await browser.close();
  await app.close();
}
