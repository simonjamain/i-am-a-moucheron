// Real browser loading regression: delayed game graph, animated detailed fly,
// successful readiness, and retry after a failed module request. In npm run e2e (CI), not npm test.
// The exit lasts 1.4 s and Playwright can notice it hundreds of milliseconds late on a
// loaded CPU, so the departure is sampled inside the page (every 30 ms, from the first
// script of each navigation) rather than read after fixed delays.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
await mkdir('work', { recursive: true });
import { createGameServer } from '../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const app = createGameServer({ portBegin: 43500, portEnd: 43509 });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    const samples = [];
    Object.defineProperty(window, '__departure', { value: samples });
    const tick = () => {
      const loading = document.getElementById('loading');
      const lobby = document.getElementById('lobby');
      if (!loading && samples.length) return samples.push({ removed: true, inert: lobby?.inert });
      if (loading?.classList.contains('departing'))
        samples.push({
          alpha: Number(getComputedStyle(loading).backgroundColor.match(/, ([\d.]+)\)$/)?.[1] ?? 1),
          text: Number(getComputedStyle(loading.querySelector('strong')).opacity),
          canvas: loading.querySelectorAll('canvas').length,
          inert: lobby?.inert,
        });
      setTimeout(tick, 30);
    };
    tick();
  });
  // Waits for the overlay to leave, then returns what the page saw while it departed.
  const departure = async () => {
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.__departure.at(-1)?.removed);
    const samples = await page.evaluate(() => window.__departure);
    const during = samples.slice(0, -1);
    assert.ok(during.length > 0, 'departure observed before removal');
    assert.ok(
      during.every((s) => s.canvas === 1),
      'detailed fly stays on screen during departure',
    );
    assert.ok(
      during.every((s) => s.inert === true),
      'menu not clickable during departure',
    );
    assert.equal(samples.at(-1).inert, false, 'menu clickable after departure');
    return during;
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/client.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/', { waitUntil: 'commit' });
  await page.locator('#loading canvas').waitFor();
  assert.equal(
    await page.locator('#lobby').isVisible(),
    false,
    'selection hidden while resources load',
  );
  const first = await page.screenshot();
  await page.waitForTimeout(350);
  const second = await page.screenshot({ path: 'work/loader-round2.png' });
  assert.ok(!first.equals(second), 'detailed fly moves during resource wait');
  release();
  await page.waitForFunction(() => !document.body.classList.contains('booting'), {
    timeout: 60000,
  });
  assert.equal(await page.locator('#lobby').isVisible(), true);
  const flight = await page.screenshot({ path: 'work/loader-departure.png' });
  await page.waitForTimeout(250);
  assert.ok(!flight.equals(await page.screenshot()), 'departure continues moving');
  const cold = await departure();
  assert.ok(
    cold.some((s) => s.alpha > 0 && s.alpha < 1),
    'dark background reveals the menu gradually: ' + cold.map((s) => s.alpha).join(' '),
  );
  assert.ok(
    cold.some((s) => s.text < 0.1),
    'loading label fades out',
  );
  // Warm resources: the exit must still play rather than being removed at readiness.
  await page.unroute('**/client.js');
  await page.reload({ waitUntil: 'commit' });
  await departure();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'commit' });
  await departure();
  assert.equal(await page.locator('#lobby').isVisible(), true);
  assert.deepEqual(errors, []);
  await page.close();
  const failed = await browser.newPage();
  let fail = true;
  await failed.route('**/client.js', (route) => (fail ? route.abort() : route.continue()));
  await failed.goto('http://127.0.0.1:' + app.server.address().port + '/', { waitUntil: 'commit' });
  await failed.locator('#loadingError').waitFor();
  fail = false;
  await failed.locator('#loadingRetry').click();
  await failed.waitForFunction(() => !document.body.classList.contains('booting'), {
    timeout: 60000,
  });
  await failed.locator('#loading').waitFor({ state: 'detached' });
  console.log(
    'Browser loading: exit animation, background/text fade, warm reload, reduced motion, immediate screen, animated detailed midge, gated selection, failed resource and successful retry',
  );
} finally {
  await browser.close();
  await app.close();
}
