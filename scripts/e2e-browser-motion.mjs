// Manual end-to-end check (not part of npm test): two real Chromium pages join
// the same room on a local UDP server; each must receive the other's motion as
// shared binary batches, decoded by the game's own module, without page errors.
//   node scripts/assemble.mjs && node scripts/e2e-browser-motion.mjs [bind-ip]
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
// e2e-browser-resume.mjs), and keep the binary messages of the motion channel.
const harness = () => {
  const Native = RTCPeerConnection;
  globalThis.motionMessages = [];
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
    createDataChannel(label, options) {
      const channel = super.createDataChannel(label, options);
      if (label.startsWith('motion'))
        channel.addEventListener('message', (e) => {
          if (e.data instanceof ArrayBuffer && motionMessages.length < 200)
            motionMessages.push(e.data);
        });
      return channel;
    }
  };
};
try {
  const pages = [];
  for (const name of ['Alpha', 'Bravo']) {
    const page = await browser.newPage();
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
    pages.push(page);
  }
  const room = app.game.rooms.get('E2EMOTION');
  const ids = [...room.pilots.keys()];
  assert.equal(ids.length, 2);
  await until(
    async () => (await pages[0].evaluate(() => motionMessages.length)) > 10,
    10000,
    'binary motion batches reach the browser',
  );
  // Decode in the page with the game's own module.
  const peers = await pages[0].evaluate(async () => {
    const { decodeMotionBatch } = await import('/motion-wire.js');
    const found = new Set();
    for (const data of motionMessages)
      for (const entry of decodeMotionBatch(data).entries)
        // Senders attach their capture time; receivers space samples by it.
        if (Number.isFinite(entry.captured)) found.add(entry.peer);
    return [...found];
  });
  const bravo = ids.find((id) => room.pilots.get(id).name === 'Bravo');
  assert.ok(
    peers.includes(bravo),
    'Alpha receives Bravo motion, with its capture time, in shared batches',
  );
  const sizes = await pages[0].evaluate(() => motionMessages.map((m) => m.byteLength));
  assert.ok(Math.max(...sizes) <= 1100, 'batches fit the UDP payload');
  for (const page of pages) assert.deepEqual(page.errors, [], 'no page error');
  console.log(
    'Browser motion: ' +
      sizes.length +
      ' binary batches received by Alpha (max ' +
      Math.max(...sizes) +
      ' B), Bravo decoded, no page error.',
  );
} finally {
  await browser.close();
  await app.close();
}
