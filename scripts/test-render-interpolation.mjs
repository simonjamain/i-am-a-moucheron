// The frame loop of src/client.js (fixed 1/120 s steps from an accumulator) against screens of
// several refresh rates, with and without jitter: how evenly a vehicle moving at constant speed
// advances from one displayed frame to the next, and whether it ever steps back.
import assert from 'node:assert/strict';
import { RenderInterpolation, blend } from '../src/render-interpolation.ts';

const STEP = 1 / 120;
const SPEED = 60; // units per second
function simulate(hz, { jitter = 0, interpolate, seconds = 20, seed = 7 }) {
  let rnd = seed;
  const random = () => ((rnd = (rnd * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1;
  const body = { x: 0, q: [0, 0, 0, 1] };
  const target = {
    read: () => [body.x, 0, 0, ...body.q],
    write: (p) => {
      body.x = p[0];
      body.q = [p[3], p[4], p[5], p[6]];
    },
  };
  const view = new RenderInterpolation();
  let acc = 0,
    now = 0;
  const shown = [];
  const frames = [];
  while (now < seconds) {
    const dt = Math.max(0.001, 1 / hz + (jitter * random()) / hz);
    now += dt;
    acc += Math.min(dt, 0.25);
    if (interpolate) view.restore(target);
    while (acc >= STEP) {
      if (interpolate) view.step(target, () => (body.x += SPEED * STEP));
      else body.x += SPEED * STEP;
      acc -= STEP;
    }
    if (interpolate) view.show(target, acc / STEP);
    shown.push(body.x);
    frames.push(dt);
  }
  // Advance per frame relative to what the clock says it should be.
  const ratios = [];
  let back = 0;
  for (let i = 5; i < shown.length; i++) {
    const advance = shown[i] - shown[i - 1];
    if (advance < 0) back++;
    ratios.push(advance / (SPEED * frames[i]));
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const spread = Math.sqrt(ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length);
  return { spread, back, worst: Math.max(...ratios.map((r) => Math.abs(r - 1))) };
}

const rows = [];
for (const hz of [60, 75, 90, 120, 144, 165]) {
  for (const jitter of [0, 0.3]) {
    const raw = simulate(hz, { jitter, interpolate: false }),
      smooth = simulate(hz, { jitter, interpolate: true });
    rows.push([hz, jitter, raw.spread, smooth.spread, raw.worst, smooth.worst]);
    assert.equal(smooth.back, 0, `${hz} Hz: never steps back`);
    // On a 120 Hz-multiple screen without jitter the steps already line up: no worse than before.
    assert.ok(smooth.spread <= raw.spread + 1e-6, `${hz} Hz jitter ${jitter}: not worse`);
    if (hz === 75 || hz === 144 || hz === 165 || jitter > 0)
      assert.ok(
        smooth.spread < 0.5 * raw.spread + 1e-6,
        `${hz} Hz jitter ${jitter}: at least twice as even (${raw.spread.toFixed(3)} → ${smooth.spread.toFixed(3)})`,
      );
  }
}
console.log('Hz  jitter  spread before → after   worst before → after');
for (const [hz, j, a, b, c, d] of rows)
  console.log(
    String(hz).padEnd(4),
    String(j).padEnd(7),
    a.toFixed(3),
    '→',
    b.toFixed(3),
    '      ',
    c.toFixed(2),
    '→',
    d.toFixed(2),
  );

// Blending: shortest rotation, unit quaternion, endpoints exact; a moved vehicle is not blended.
{
  const a = [0, 0, 0, 0, 0, 0, 1],
    b = [10, 0, 0, 0, 0, Math.sin(0.5), Math.cos(0.5)];
  assert.deepEqual(blend(a, b, 0).slice(0, 3), [0, 0, 0]);
  assert.deepEqual(blend(a, b, 1).slice(0, 3), [10, 0, 0]);
  const mid = blend(a, [10, 0, 0, 0, 0, -Math.sin(0.5), -Math.cos(0.5)], 0.5);
  assert.ok(Math.abs(Math.hypot(...mid.slice(3)) - 1) < 1e-9, 'unit quaternion');
  assert.ok(Math.abs(mid[5]) < 0.3, 'the opposite sign is the same rotation: short way round');
  const body = { p: [0, 0, 0, 0, 0, 0, 1] };
  const target = { read: () => [...body.p], write: (p) => (body.p = [...p]) };
  const view = new RenderInterpolation();
  view.step(target, () => (body.p = [1, 0, 0, 0, 0, 0, 1]));
  view.step(target, () => (body.p = [2, 0, 0, 0, 0, 0, 1]));
  view.show(target, 0.5);
  assert.equal(body.p[0], 1.5, 'half way between the last two steps');
  view.restore(target);
  assert.equal(body.p[0], 2, 'the stepped pose is back for the next step');
  view.show(target, 0.5);
  body.p = [500, 0, 0, 0, 0, 0, 1]; // something teleports the vehicle between frames
  view.restore(target);
  assert.equal(body.p[0], 500, 'a moved vehicle is left where it is');
  view.step(target, () => (body.p = [5000, 0, 0, 0, 0, 0, 1]));
  view.show(target, 0.5);
  assert.equal(body.p[0], 5000, 'a teleport is not blended');
}
console.log('test-render-interpolation ok');
