// This entry has no static imports: the HTML loading screen paints before any
// game modules arrive. Load the detailed fly first, then the full game graph.
// (Type-only imports are erased: still no static import at runtime.)
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

/** The part of the midge rig the loading screen animates. */
interface LoadingFly {
  container: THREE.Object3D;
  animate(ms: number): void;
}
/** The fly's pose when the departure starts. */
interface Departure {
  at: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  facing: THREE.Quaternion;
}
const loading = document.getElementById('loading')!;
let stop = () => {};
let depart = () => {};
let visibleSince = performance.now();
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
try {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  // Browser URLs served by scripts/assemble.mjs: tsc has no module behind them.
  const [T, { createMidgeRig }] = (await Promise.all([
    // @ts-expect-error browser-only URL (vendor/three.webgpu.min.js)
    import('/three.js'),
    // @ts-expect-error browser-only URL (src/midge-model.ts)
    import('/midge-model.js'),
  ])) as [Three, { createMidgeRig(T: Three): LoadingFly }];
  let pending = 0;
  const failed: string[] = [];
  const manager = T.DefaultLoadingManager;
  const start = manager.itemStart.bind(manager),
    end = manager.itemEnd.bind(manager),
    error = manager.itemError.bind(manager);
  manager.itemStart = (url: string) => {
    pending++;
    start(url);
  };
  manager.itemEnd = (url: string) => {
    pending--;
    end(url);
  };
  manager.itemError = (url: string) => {
    failed.push(url);
    error(url);
  };
  try {
    const renderer = new T.WebGPURenderer({ antialias: true, alpha: true });
    await renderer.init();
    loading.prepend(renderer.domElement);
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    const scene = new T.Scene();
    renderer.setClearColor(0x000000, 0);
    scene.add(new T.HemisphereLight('#fff6da', '#36564b', 3));
    const camera = new T.PerspectiveCamera(40, 1, 0.1, 40);
    camera.position.set(0, 0, 13);
    const fly = createMidgeRig(T);
    scene.add(fly.container);
    fly.container.scale.setScalar(0.7);
    let active = true;
    let exit: Departure | null = null;
    depart = () => {
      exit = {
        at: performance.now(),
        position: fly.container.position.clone(),
        rotation: fly.container.quaternion.clone(),
        facing: new T.Quaternion().setFromEuler(new T.Euler(0, Math.PI, 0)),
      };
    };
    visibleSince = performance.now();
    function frame(ms: number): void {
      if (!active) return;
      const aspect = innerWidth / innerHeight;
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const t = ms / 1000,
        angle = t * 1.1;
      if (exit) {
        const progress = Math.min(1, Math.max(0, (ms - exit.at) / 1400));
        const turn = Math.min(1, progress / 0.3);
        fly.container.quaternion.slerpQuaternions(
          exit.rotation,
          exit.facing,
          turn * turn * (3 - 2 * turn),
        );
        // First face the viewer, then accelerate through the camera plane.
        const flight = Math.max(0, (progress - 0.2) / 0.8) ** 2;
        fly.container.position.set(
          exit.position.x * (1 - flight),
          exit.position.y * (1 - flight),
          exit.position.z + (16 - exit.position.z) * flight,
        );
      } else if (!exit) {
        fly.container.position.set(
          Math.cos(angle) * Math.min(4, aspect * 2.3),
          Math.sin(angle) * 1.5,
          Math.sin(angle * 2) * 0.5,
        );
        fly.container.rotation.set(
          0.12 * Math.sin(t),
          -Math.PI / 2 - angle,
          0.15 * Math.sin(t * 2),
        );
      }
      fly.animate(ms);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    stop = () => {
      active = false;
      renderer.dispose();
      renderer.domElement.remove();
    };
  } catch {
    // A missing GPU backend must not block loading: the game has a software fallback.
  }
  // @ts-expect-error browser-only URL (src/client.js)
  const module = (await import('/client.js')) as { homeReady: Promise<unknown> };
  await module.homeReady;
  const deadline = performance.now() + 30000;
  while (pending > 0 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 30));
  if (pending || failed.length) throw Error('Certaines ressources n’ont pas pu être chargées.');
  manager.itemStart = start;
  manager.itemEnd = end;
  manager.itemError = error;
  // The fly-by also plays under prefers-reduced-motion: many PCs report it
  // without the user having chosen it, and it replaced the exit by a bare fade.
  // Let a cached load still show the model, without extending slow loads.
  await wait(Math.max(0, 900 - (performance.now() - visibleSince)));
  const lobby = document.getElementById('lobby');
  const wasInert = lobby?.inert as boolean;
  if (lobby) lobby.inert = true;
  document.body.classList.remove('booting');
  depart();
  loading.classList.add('departing');
  // A timer also completes when a background tab pauses animation frames.
  await wait(1400);
  stop();
  loading.remove();
  if (lobby) lobby.inert = wasInert;
} catch {
  stop();
  document.getElementById('loadingError')!.hidden = false;
  document.getElementById('loadingRetry')!.onclick = () => location.reload();
}
