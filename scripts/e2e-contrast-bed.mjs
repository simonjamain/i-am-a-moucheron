// Optional WebGL/HUD verification. Same Playwright variables as e2e-office-clouds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createGameServer } from '../server/index.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const app = createGameServer({ portBegin: 43810, portEnd: 43819 });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const css = readFileSync('src/index.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.route('**/contrast-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `
    <meta charset="utf-8"><style>${css}
    body{margin:0;background:white;overflow:hidden}#hudSample{position:absolute;inset:0;pointer-events:none}
    #mouseAim{left:35%;top:15%}#crosshair{left:65%;top:15%}
    </style><div id="hudSample"><div id="mouseAim"></div><div id="crosshair"></div></div>
    <script type="module">
      import * as T from '/three.js';
      import {makeBed} from '/bed-model.js';
      import {makeServiceStation} from '/station-model.js';
      import {makeBiplaneBomber} from '/biplane-model.js';
      import {vehiclePad,vehicleEntry} from '/fleet.js';
      import {MAP,ACTOR_UNIT} from '/scale.js';
      import {OFFICE_LAYOUT} from '/layout.js';
      import {TracerPool,updateTracer,TRACER_COLOR} from '/tracers.js';
      import {installOfficeFog} from '/office-fog.js';
      import {ShopThumbnails} from '/shop-thumbs.js';
      installOfficeFog(T);
      const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(1000,650);document.body.append(renderer.domElement);
      const scene=new T.Scene();scene.background=new T.Color('#829f91');
      scene.add(new T.HemisphereLight(0xffffff,0x445544,3));
      const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,6,4);scene.add(sun);
      const bed=makeBed(T);scene.add(bed);
      const camera=new T.PerspectiveCamera(40,1000/650,.01,100);
      camera.position.set(5,4,6);camera.lookAt(0,.5,0);
      await new Promise(resolve=>{T.DefaultLoadingManager.onLoad=resolve;setTimeout(resolve,3000)});
      window.bedView=()=>{document.getElementById('hudSample').hidden=true;renderer.render(scene,camera)};
      window.bedView();
      const shop=new ShopThumbnails(T);
      window.shopBed=await shop.picture('bed');
      window.tracerView=(instanced=false,occluded=false,distance=.12)=>{
        document.getElementById('hudSample').hidden=false;
        const s=new T.Scene();s.background=new T.Color('white');s.fog=new T.FogExp2('white',.018);
        const c=new T.PerspectiveCamera(40,1000/650,.00005,40);c.position.set(0,2.6,distance);c.lookAt(0,2.6,0);
        const pool=new TracerPool(T,s,8,{instanced});
        const trace=pool.acquire(new T.Vector3(.016,2.6,0),new T.Vector3(1,0,0),TRACER_COLOR);
        updateTracer(T,trace,new T.Vector3(1,0,0),c);pool.flush();
        let blocker;
        if(occluded){blocker=new T.Mesh(new T.PlaneGeometry(5,5),new T.MeshBasicMaterial({color:'white'}));blocker.position.set(0,2.6,distance/2);s.add(blocker)}
        renderer.render(s,c);
        const copy=document.createElement('canvas');copy.width=1000;copy.height=650;
        const ctx=copy.getContext('2d');ctx.drawImage(renderer.domElement,0,0);
        const bytes=ctx.getImageData(0,0,1000,650).data;let orange=0,dark=0,nonwhite=0;
        for(let i=0;i<bytes.length;i+=4){const[r,g,b]=bytes.slice(i,i+3);if(r>g+15&&g>b+15)orange++;if(r<180&&g<180&&b<180)dark++;if(Math.min(r,g,b)<240)nonwhite++}
        pool.dispose();blocker?.geometry.dispose();blocker?.material.dispose();return {orange,dark,nonwhite};
      };
      window.baseView=()=>{
        document.getElementById('hudSample').hidden=true;const s=new T.Scene();s.background=new T.Color('#829f91');
        s.add(new T.HemisphereLight(0xffffff,0x445544,3));s.add(sun.clone());
        const b=OFFICE_LAYOUT.base,plane=makeBiplaneBomber(T,s),state=vehiclePad('bomber');
        plane.position.fromArray(state.p);plane.quaternion.fromArray(state.q);plane.scale.setScalar(ACTOR_UNIT);
        const station=makeServiceStation(T,'refuel');station.scale.setScalar(MAP.ratio);station.position.set(b.originX,b.deckY+.00005,b.originZ+b.refuelOffsetZ);s.add(station);
        for(const seat of ['pilot','dorsal']){const e=vehicleEntry({type:'bomber',state},seat),ring=new T.Mesh(new T.RingGeometry(MAP.metres(2.9),MAP.metres(3),48),new T.MeshBasicMaterial({color:'#d5ef73',side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(e.x,e.y+.0001,e.z);s.add(ring)}
        const c=new T.PerspectiveCamera(38,1000/650,.00005,10);c.position.set(b.originX+.14,b.deckY+.2,b.originZ+.12);c.lookAt(b.originX+.01,b.deckY,b.originZ-.04);renderer.render(s,c);
      };
      window.ready=true;
    </script>`,
    }),
  );
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/contrast-review');
  await page.waitForFunction(() => window.ready);
  for (const id of ['mouseAim', 'crosshair']) {
    const styles = await page.locator('#' + id).evaluate((el) => ({
      border: getComputedStyle(el).borderTopColor,
      shadow: getComputedStyle(el).boxShadow,
      dot: getComputedStyle(el, '::after').boxShadow,
    }));
    assert.equal(styles.border, 'rgb(255, 255, 255)');
    assert.notEqual(styles.shadow, 'none');
    assert.notEqual(styles.dot, 'none');
  }
  await page.evaluate(() => window.bedView());
  if (process.env.REVIEW_DIR)
    await page.screenshot({ path: process.env.REVIEW_DIR + '/drawer-bed-289.png' });
  assert.ok(await page.evaluate(() => window.shopBed?.startsWith('data:image/png;base64,')));
  for (const instanced of [false, true]) {
    const visible = await page.evaluate((i) => window.tracerView(i), instanced);
    assert.ok(
      visible.orange > 20 && visible.dark > 20,
      'orange core and dark outline must both be visible: ' + JSON.stringify(visible),
    );
    const hidden = await page.evaluate((i) => window.tracerView(i, true), instanced);
    assert.equal(hidden.nonwhite, 0, 'wall must occlude tracer');
    const distant = await page.evaluate((i) => window.tracerView(i, false, 2), instanced);
    assert.equal(distant.nonwhite, 0, 'thick clouds still attenuate distant tracers');
  }
  await page.evaluate(() => window.tracerView(true));
  if (process.env.REVIEW_DIR)
    await page.screenshot({ path: process.env.REVIEW_DIR + '/contrast-289.png' });
  await page.evaluate(() => window.baseView());
  if (process.env.REVIEW_DIR)
    await page.screenshot({ path: process.env.REVIEW_DIR + '/alpha-access-289.png' });
  await page.goto('http://127.0.0.1:' + app.server.address().port + '/');
  await page.waitForFunction(() => !document.body.classList.contains('booting'), {
    timeout: 60000,
  });
  assert.equal(await page.locator('#lobby').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    'WebGL/HUD: both sights outlined; real textured bed/shop; ordinary and instanced orange/dark tracers, fog attenuation and wall occlusion; Alpha layout rendered; full game boot reaches lobby',
  );
} finally {
  await browser?.close();
  await app.close();
}
