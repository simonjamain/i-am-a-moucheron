// Office lighting: lamps of a layout (lit ceiling fans, desk lamps), sky and sun per
// layout, lamp shadows rendered once without the moving things. See
// docs/office-lighting.md.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { LAYOUTS, setActiveLayout } from '../src/layouts.ts';
import { propColliders, ROD } from '../src/office-props.ts';
import { officeLamps, bakeOfficeShadows, LAMP_LOOK } from '../src/office-lights.ts';
import { OFFICE_CLOUD_TOP, OFFICE_FOG_START } from '../src/office-fog.ts';
import { createGraphics } from '../src/graphics.js';
import { createOffice } from '../src/office.js';

const diagonale = LAYOUTS.find((l) => l.id === 'diagonale');
const lamps = officeLamps(diagonale.props);
assert.deepEqual(
  lamps.map((l) => l.kind).sort(),
  ['desk', 'fan', 'fan'],
  'Diagonale: two lit fans and one desk lamp',
);

// Fans hang below the clouds (blades under the haze), from a rod that rises into them,
// and stay clear of every enemy air route.
const fans = diagonale.props.filter((p) => p.model === 'Ceiling_Fan');
const dist = (p, b) =>
  Math.hypot(...['x', 'y', 'z'].map((k, i) => Math.max(b.min[k] - p[i], 0, p[i] - b.max[k])));
for (const fan of fans) {
  const boxes = propColliders(fan);
  assert.ok(Math.min(...boxes.map((b) => b.min.y)) < OFFICE_FOG_START - 0.2, 'fan below the haze');
  assert.ok(fan.y + ROD > OFFICE_CLOUD_TOP + 0.5, 'rod rises into the clouds');
  for (const route of diagonale.airRoutes)
    for (let i = 0; i + 1 < route.length; i++)
      for (let t = 0; t <= 1; t += 0.01) {
        const p = route[i].map((v, k) => v + (route[i + 1][k] - v) * t);
        for (const b of boxes) assert.ok(dist(p, b) > 0.15, 'enemy route clear of a fan');
      }
}

const lights = (root, test) => {
  const out = [];
  root.traverse((o) => test(o) && out.push(o));
  return out;
};
const scene = new T.Scene();
setActiveLayout('diagonale');
let office = createOffice(T, scene, createGraphics(T, scene));
const sun = scene.children.find((o) => o.isDirectionalLight);
const sky = scene.children.find((o) => o.isHemisphereLight);
const cones = lights(office.root, (o) => o.isSpotLight);
assert.equal(cones.length, 2, 'one cone per fan');
for (const c of cones) {
  assert.ok(c.castShadow && c.shadow.autoUpdate === false && c.shadow.needsUpdate === true);
  assert.equal(c.target.position.y, 0, 'cone points down');
  assert.equal(c.target.parent, office.root);
}
assert.equal(lights(office.root, (o) => o.isPointLight).length, 1, 'one desk lamp');
// Lamp-lit room: dim sky, sun from above (landing shadows under the movers).
assert.equal(sky.intensity, LAMP_LOOK.sky.intensity);
assert.equal(sun.intensity, LAMP_LOOK.sun.intensity);
assert.ok(sun.position.y > 3 * Math.hypot(sun.position.x, sun.position.z), 'sun from above');
assert.ok(sun.castShadow);

// Bake: one render of the room alone, into an off-screen target, then the room no
// longer casts into the sun's map (only moving things do).
const mover = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1));
mover.castShadow = true;
scene.add(mover);
const calls = [];
let current = 'screen';
const renderer = {
  isWebGLRenderer: true,
  getRenderTarget: () => current,
  setRenderTarget: (t) => (current = t),
  render(stage) {
    const inside = [];
    stage.traverse((o) => inside.push(o));
    calls.push({ target: current, mover: inside.includes(mover), sun: inside.includes(sun) });
  },
};
assert.ok(office.root.children.some((o) => o.isMesh && o.castShadow));
assert.equal(bakeOfficeShadows(T, null, office.root), false, 'no renderer, nothing baked');
assert.equal(office.bakeShadows(renderer), true);
assert.equal(calls.length, 1);
assert.ok(calls[0].target.isWebGLRenderTarget && !calls[0].mover && !calls[0].sun);
assert.equal(current, 'screen', 'render target restored');
assert.equal(office.root.parent, scene, 'room back in the scene');
assert.ok(lights(office.root, (o) => o.isMesh && o.castShadow).length === 0);
assert.ok(mover.castShadow);
office.dispose();

// A layout without lamps keeps the legacy slanted sun and bakes nothing.
setActiveLayout('ilots');
office = createOffice(T, scene, createGraphics(T, scene));
assert.equal(lights(office.root, (o) => o.isSpotLight).length, 0, 'no fan, no cone');
assert.deepEqual(sun.position.toArray(), [...LAMP_LOOK.legacySun.position]);
assert.equal(sun.intensity, 4);
assert.equal(office.bakeShadows(renderer), false);
assert.equal(scene.children.filter((o) => o.isDirectionalLight).length, 1, 'one sun');
office.dispose();
setActiveLayout(LAYOUTS[0].id);
console.log(
  'Office lights: two lit fans below the clouds clear of enemy routes, cones baked once without movers, sun from above.',
);
