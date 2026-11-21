import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as Three from '../vendor/three.module.min.js';

// Execute the actual bootstrap with a deterministic clock and DOM/renderer adapters.
// Real Three transforms; this checks lifecycle/trajectory, not pixels or GPU rendering.
const source = stripTypeScriptTypes(
  await readFile(new URL('../src/boot.ts', import.meta.url), 'utf8'),
).replaceAll('import(', 'importModule(');
async function scenario({ reduced = false, readyAt = 0, fail = false, webgl = true } = {}) {
  let now = 0,
    disposed = false,
    lost = false,
    removed = false,
    departureAt = null;
  const timers = [],
    samples = [];
  const classes = new Set(['booting']);
  const lobby = { inert: false };
  const loading = {
    prepend() {},
    remove() {
      removed = true;
    },
    classList: {
      add(name) {
        assert.equal(name, 'departing');
        departureAt = now;
      },
    },
  };
  const error = { hidden: true },
    retry = {};
  const container = new Three.Group();
  const manager = { itemStart() {}, itemEnd() {}, itemError() {} };
  const T = {
    ...Three,
    DefaultLoadingManager: manager,
    WebGLRenderer: class {
      constructor() {
        if (!webgl) throw Error('No WebGL');
      }
      domElement = { remove() {} };
      setPixelRatio() {}
      setSize() {}
      setClearColor(_, alpha) {
        assert.equal(alpha, 0);
      }
      render() {
        samples.push({
          at: now,
          z: container.position.z,
          direction: new Three.Vector3(0, 0, -1).applyQuaternion(container.quaternion),
        });
      }
      dispose() {
        disposed = true;
      }
      forceContextLoss() {
        lost = true;
      }
    },
  };
  const schedule = (fn, delay) => timers.push({ at: now + delay, fn });
  const imports = async (path) => {
    if (path === '/three.js') return T;
    if (path === '/midge-model.js') return { createMidgeRig: () => ({ container, animate() {} }) };
    if (fail) throw Error('Asset failure');
    return { homeReady: new Promise((resolve) => schedule(resolve, Math.max(0, readyAt - now))) };
  };
  const env = {
    document: {
      getElementById: (id) => ({ loading, lobby, loadingError: error, loadingRetry: retry })[id],
      body: { classList: { remove: (name) => classes.delete(name) } },
    },
    performance: { now: () => now },
    requestAnimationFrame: (fn) => schedule(() => fn(now), 16),
    setTimeout: schedule,
    matchMedia: () => ({ matches: reduced }),
    devicePixelRatio: 1,
    innerWidth: 960,
    innerHeight: 540,
    location: { reload() {} },
    importModule: imports,
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let done = false;
  const task = new AsyncFunction(...Object.keys(env), source)(...Object.values(env)).then(() => {
    done = true;
  });
  for (let i = 0; !done && i < 1000; i++) {
    for (let flush = 0; flush < 20; flush++) await Promise.resolve();
    if (done) break;
    timers.sort((a, b) => a.at - b.at);
    const next = timers.shift();
    assert.ok(next, 'bootstrap must be able to progress');
    now = next.at;
    if (departureAt !== null && !removed) {
      assert.equal(classes.has('booting'), false, 'menu visible behind the fade');
      assert.equal(lobby.inert, true, 'menu cannot receive input during the exit');
    }
    next.fn();
  }
  await task;
  if (fail) {
    assert.equal(error.hidden, false);
    assert.equal(typeof retry.onclick, 'function');
    assert.equal(departureAt, null, 'failed load does not reveal the menu');
    return;
  }
  assert.ok(removed);
  assert.equal(lobby.inert, false);
  if (webgl) assert.ok(disposed && lost, 'temporary renderer cleaned up');
  assert.ok(departureAt >= readyAt, 'wait for assets');
  {
    assert.ok(departureAt >= 900, 'cached loading still displays the fly');
    assert.equal(now - departureAt, 1400);
    if (webgl) {
      const flying = samples.filter((s) => s.at > departureAt + 500);
      assert.ok(flying.at(-1).z > 13, 'fly crosses the camera plane toward the viewer');
      assert.ok(
        flying.every((s) => s.direction.z > 0.99),
        'head faces the viewer',
      );
      assert.ok(
        flying.every((s, i) => !i || s.z >= flying[i - 1].z),
        'continuous forward flight',
      );
    }
  }
}
await scenario();
await scenario({ readyAt: 4000 });
await scenario({ reduced: true });
await scenario({ fail: true });
await scenario({ webgl: false });
console.log(
  'Loading exit: cached/slow readiness, menu/input gating, forward flight, reduced motion, failure/retry and renderer cleanup. Pixel rendering not tested.',
);
