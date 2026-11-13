// Optional real-WebGL regression. Requires Playwright and an installed Chromium.
// PLAYWRIGHT_PATH selects its package; CHROMIUM_PATH optionally selects the binary.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGameServer } from '../server/index.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const app = createGameServer({ portBegin: 43800, portEnd: 43809 });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 650 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/cloud-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body{margin:0}canvas{display:block}</style><script type="module">
      import * as T from '/three.js';
      import {createOffice} from '/office.js';
      import {createGraphics} from '/graphics.js';
      import {OFFICE_LAYOUT} from '/layout.js';
      import {installOfficeFog,officeFogCeiling} from '/office-fog.js';
      import {ToonRenderer} from '/toon.js';
      installOfficeFog(T);
      const scene=new T.Scene();
      scene.background=new T.Color('#829f91');
      scene.fog=new T.FogExp2('#ffffff',.018);
      scene.add(officeFogCeiling(T,OFFICE_LAYOUT.bounds));
      createOffice(T,scene,createGraphics(T,scene));
      const renderer=new T.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true});
      renderer.setSize(1200,650);document.body.append(renderer.domElement);
      const toon=new ToonRenderer(T,renderer),camera=new T.PerspectiveCamera(62,1200/650,.00005,40);
      const read=document.createElement('canvas');read.width=1200;read.height=650;
      const ctx=read.getContext('2d');
      window.captureCloud=(yaw,height=.95,pitch=.4)=>{
        camera.position.set(0,height,0);
        camera.lookAt(Math.sin(yaw)*4,height+pitch*4,-Math.cos(yaw)*4);
        toon.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);
        return Array.from(ctx.getImageData(600,300,1,1).data).slice(0,3);
      };
      window.ready=true;
    </script>`,
    }),
  );
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/cloud-review');
  await page.waitForFunction(() => window.ready);
  for (const [direction, yaw] of [
    ['north', 0],
    ['east', Math.PI / 2],
    ['south', Math.PI],
    ['west', -Math.PI / 2],
  ]) {
    const below = await page.evaluate((y) => window.captureCloud(y), yaw);
    assert.ok(Math.min(...below) > 200, `${direction}: upward ray must see cloud, got ${below}`);
    const inside = await page.evaluate((y) => window.captureCloud(y, 3.2, 0), yaw);
    assert.ok(
      Math.min(...inside) > 245,
      `${direction}: new flight space stays clouded, got ${inside}`,
    );
  }
  const above = await page.evaluate(() => window.captureCloud(Math.PI, 3.96, -0.3));
  assert.ok(Math.min(...above) > 245, 'chase camera just above flight limit still sees cloud');
  const clear = await page.evaluate(() => window.captureCloud(Math.PI, 0.95, 0));
  assert.ok(Math.max(...clear) < 200, 'horizontal view below clouds stays clear');
  await page.evaluate(() => window.captureCloud(Math.PI));
  if (process.env.CLOUD_SCREENSHOT) await page.screenshot({ path: process.env.CLOUD_SCREENSHOT });
  assert.deepEqual(errors, []);
  console.log(
    'WebGL clouds: all four directions from below and inside, clear low view, no shader errors',
  );
} finally {
  await browser?.close();
  await app.close();
}
