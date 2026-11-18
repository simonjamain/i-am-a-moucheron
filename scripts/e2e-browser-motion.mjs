// End-to-end check (npm run e2e and CI job browser-e2e; not part of npm test): two real Chromium pages join
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
// Software WebGL renders every pixel on the CPU; a small page keeps two
// browsers from starving each other on a shared runner (the server drops a
// pilot silent for 15 s). The scenario checks networking, not the picture.
const SMALL_VIEWPORT = { width: 320, height: 240 };
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
    const page = await browser.newPage({ viewport: SMALL_VIEWPORT });
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.addInitScript(harness);
    await page.goto(url);
    // The lobby is usable once the loading screen has left (see e2e-loading).
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
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
  // Decode in the page with the game's own module. The first batches may carry
  // only Alpha's own echo, so wait until Bravo's motion is among them instead
  // of decoding once: a slow runner delivers it later, not never.
  // Without a capture time a batch entry is useless to receivers (see below).
  const decodePeers = () =>
    pages[0].evaluate(async () => {
      const { decodeMotionBatch } = await import('/motion-wire.js');
      const timed = new Set(),
        all = new Set();
      for (const data of motionMessages)
        for (const entry of decodeMotionBatch(data).entries) {
          all.add(entry.peer);
          // Senders attach their capture time; receivers space samples by it.
          if (Number.isFinite(entry.captured)) timed.add(entry.peer);
        }
      return { timed: [...timed], all: [...all], batches: motionMessages.length };
    });
  const bravo = ids.find((id) => room.pilots.get(id).name === 'Bravo');
  try {
    await until(
      async () => (await decodePeers()).timed.includes(bravo),
      45000,
      'Alpha receives Bravo motion, with its capture time, in shared batches',
    );
  } catch (error) {
    // Say what each side saw, so a runner-only failure can be diagnosed.
    const sessions = [...app.connections].map((c) => ({
      pilot: c.session.player?.id,
      name: c.session.player?.name,
      transport: c.transport,
      lastSeq: c.session.lastSeq,
      lastMotionMsAgo: Number.isFinite(c.session.lastAt) ? Date.now() - c.session.lastAt : null,
    }));
    throw new Error(
      error.message +
        ' | bravo=' +
        bravo +
        ' alpha-saw=' +
        JSON.stringify(await decodePeers()) +
        ' room=' +
        JSON.stringify([...room.pilots.values()].map((p) => [p.id.slice(0, 4), p.name])) +
        ' server-sessions=' +
        JSON.stringify(sessions),
    );
  }
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
