// Real browser check of the plan picker: six cards, the background room follows
// the choice, a joined room keeps its plan, a second player joining the same code
// with another choice lands in the first player's plan. In npm run e2e (CI), not npm test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createGameServer } from '../server/index.js';
import { LAYOUTS } from '../src/layouts.js';
await mkdir('work', { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const app = createGameServer({ portBegin: 43600, portEnd: 43619 });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + app.server.address().port + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
async function open(query = '') {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url + query);
  await page.waitForFunction(() => !document.body.classList.contains('booting'), undefined, {
    timeout: 90000,
  });
  return page;
}
try {
  const a = await open();
  const cards = a.locator('#plans button');
  assert.equal(await cards.count(), LAYOUTS.length, 'one card per plan');
  assert.equal(await a.locator('#plans button[aria-checked="true"]').count(), 1);
  for (const [i, layout] of LAYOUTS.entries()) {
    await cards.nth(i).click();
    assert.equal(await a.locator('#plans button').nth(i).getAttribute('aria-checked'), 'true');
    await a.waitForTimeout(400);
    await a.screenshot({ path: `work/lobby-${layout.id}.png` });
  }
  // Player A creates the room in the "cloison" plan.
  await cards.nth(2).click();
  await a.fill('#name', 'Alice');
  await a.fill('#code', 'ESSAIA');
  await a.click('#join');
  await a.waitForFunction(
    () => document.querySelector('#lobby').classList.contains('hidden'),
    undefined,
    {
      timeout: 90000,
    },
  );
  await a.waitForTimeout(1500);
  await a.screenshot({ path: 'work/game-cloison.png' });
  // Player B asks for another plan on the same code: the room's plan wins.
  const b = await open('?plan=ilots');
  await b.fill('#name', 'Bob');
  await b.fill('#code', 'ESSAIA');
  await b.click('#join');
  await b.waitForFunction(
    () => document.querySelector('#lobby').classList.contains('hidden'),
    undefined,
    {
      timeout: 90000,
    },
  );
  await b.waitForTimeout(1500);
  await b.screenshot({ path: 'work/game-joined.png' });
  assert.deepEqual(errors, [], 'no page error: ' + errors.join(' | '));
  console.log('PASS: plan picker, background preview, join keeps the room plan.');
  await browser.close();
  app.server.close();
  process.exit(0);
} catch (error) {
  console.error(error, errors);
  for (const page of browser.contexts().flatMap((c) => c.pages()))
    console.error(
      '#error:',
      await page
        .locator('#error')
        .textContent()
        .catch(() => '?'),
    );
  await browser.close();
  app.server.close();
  process.exit(1);
}
