// End-to-end check (npm run e2e and CI job browser-e2e; not part of npm test): a
// real Chromium dies, fades into the purgatory and walks on Saint Pierre's cloud with
// the office walker (src/arena-frame.ts, src/sortie.ts stepWalker). The body the
// server receives stands on the cloud, 150 m above the office, moves when the
// player walks and leaves the floor when it jumps.
//   node scripts/assemble.mjs && node scripts/e2e-purgatory-walk.mjs
// PURGATORY_SCREENSHOT=path saves the view. Needs Playwright with its Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGameServer } from '../server/index.js';
import { PURGATORY_FRAME } from '../src/arena-frame.ts';
import { MAP } from '../src/scale.ts';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(
    process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright',
  ));
}
const app = createGameServer({ portBegin: 43900, portEnd: 43999 });
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
};
try {
  // Software WebGL renders every pixel on the CPU: a small page (see e2e-browser-resume).
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Report ICE gathering as complete after the first candidate (see e2e-browser-resume).
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
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.fill('#name', 'Âme');
  await page.fill('#code', 'CIEL');
  await page.click('#join');
  await until(
    async () => /^● UDP · /.test((await page.textContent('#net'))?.trim() || ''),
    30000,
    'join over UDP',
  );
  const room = app.game.rooms.get('CIEL');
  const [pilot] = room.pilots.values();
  app.game.kill(room, pilot, pilot.incarnation);
  // Death is a passage (docs/purgatory-sky.md): the ghost rises, the screen fades to
  // black, and the client enters the purgatory by itself.
  await until(
    async () => Number(await page.evaluate(() => getComputedStyle(deathFade).opacity)) > 0.9,
    15000,
    'fade to black',
  );
  const body = () =>
    room.purgatory.bodies?.find((b) => b.entity === pilot.id && b.kind === 'player');
  await until(async () => Number.isFinite(body()?.y), 20000, 'soul body reported');
  const floor = PURGATORY_FRAME.originY;
  // The controls follow the captured mouse (src/control-focus.ts), as for a player.
  await page.click('#view');
  await until(
    () => page.evaluate(() => document.pointerLockElement?.id === 'view'),
    5000,
    'mouse captured',
  );
  await sleep(1500);
  assert.ok(Math.abs(body().y - floor) < MAP.metres(0.2), 'the soul stands on the cloud');
  const start = { x: body().x, z: body().z };
  await page.keyboard.down('KeyW');
  await sleep(1500);
  await page.keyboard.up('KeyW');
  await sleep(500);
  const walked = Math.hypot(body().x - start.x, body().z - start.z);
  assert.ok(walked > 0.5, 'the soul walked ' + walked.toFixed(2) + ' units');
  assert.ok(Math.abs(body().y - floor) < MAP.metres(0.2), 'still on the cloud after walking');
  let apex = body().y;
  await page.keyboard.press('Space');
  const until2 = Date.now() + 1500;
  while (Date.now() < until2) {
    apex = Math.max(apex, body().y);
    await sleep(20);
  }
  assert.ok(apex > floor + MAP.metres(0.3), 'the jump leaves the cloud');
  await until(
    async () => Math.abs(body().y - floor) < MAP.metres(0.2),
    5000,
    'lands back on the cloud',
  );
  if (process.env.PURGATORY_SCREENSHOT)
    await page.screenshot({ path: process.env.PURGATORY_SCREENSHOT });
  assert.deepEqual(errors, []);
  console.log(
    `Purgatory walk: soul on the cloud (${floor.toFixed(3)} m), walked ${walked.toFixed(1)} units, jumped ${((apex - floor) / MAP.ratio).toFixed(2)} m.`,
  );
} finally {
  await browser.close();
  await app.close();
}
