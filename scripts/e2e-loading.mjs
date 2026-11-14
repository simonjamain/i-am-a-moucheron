// Real browser loading regression: delayed game graph, animated detailed fly,
// successful readiness, and retry after a failed module request. Not in npm test.
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
  await page.locator('#loading.departing').waitFor();
  assert.equal(await page.locator('#lobby').evaluate((el) => el.inert), true);
  await page.waitForTimeout(650);
  const fade = await page.locator('#loading').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    text: Number(getComputedStyle(el.querySelector('strong')).opacity),
  }));
  assert.ok(fade.text < 0.1, 'loading label fades out');
  const alpha = Number(fade.background.match(/, ([\d.]+)\)$/)?.[1]);
  assert.ok(alpha > 0 && alpha < 1, 'dark background reveals the menu gradually');
  const flight = await page.screenshot({ path: 'work/loader-departure.png' });
  await page.waitForTimeout(250);
  assert.ok(!flight.equals(await page.screenshot()), 'departure continues moving');
  await page.locator('#loading').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#lobby').evaluate((el) => el.inert), false);
  // Warm resources: the exit must still play rather than being removed at readiness.
  await page.unroute('**/client.js');
  await page.reload({ waitUntil: 'commit' });
  await page.locator('#loading.departing').waitFor();
  assert.equal(await page.locator('#loading canvas').count(), 1);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'commit' });
  await page.locator('#loading').waitFor({ state: 'detached' });
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
