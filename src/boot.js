// This entry has no static imports: the HTML loading screen paints before any
// game modules arrive. Load the detailed fly first, then the full game graph.
const loading = document.getElementById('loading');
let stop = () => {};
try {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const [T, { createMidgeRig }] = await Promise.all([
    import('/three.js'),
    import('/midge-model.js'),
  ]);
  let pending = 0;
  const failed = [];
  const manager = T.DefaultLoadingManager;
  const start = manager.itemStart.bind(manager),
    end = manager.itemEnd.bind(manager),
    error = manager.itemError.bind(manager);
  manager.itemStart = (url) => {
    pending++;
    start(url);
  };
  manager.itemEnd = (url) => {
    pending--;
    end(url);
  };
  manager.itemError = (url) => {
    failed.push(url);
    error(url);
  };
  try {
    const renderer = new T.WebGLRenderer({ antialias: true });
    loading.prepend(renderer.domElement);
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    const scene = new T.Scene();
    scene.background = new T.Color('#091e1a');
    scene.add(new T.HemisphereLight('#fff6da', '#36564b', 3));
    const camera = new T.PerspectiveCamera(40, 1, 0.1, 40);
    camera.position.set(0, 0, 13);
    const fly = createMidgeRig(T);
    scene.add(fly.container);
    fly.container.scale.setScalar(0.7);
    let active = true;
    function frame(ms) {
      if (!active) return;
      const aspect = innerWidth / innerHeight;
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const t = ms / 1000,
        angle = t * 1.1;
      fly.container.position.set(
        Math.cos(angle) * Math.min(4, aspect * 2.3),
        Math.sin(angle) * 1.5,
        Math.sin(angle * 2) * 0.5,
      );
      fly.container.rotation.set(0.12 * Math.sin(t), -Math.PI / 2 - angle, 0.15 * Math.sin(t * 2));
      fly.animate(ms);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    stop = () => {
      active = false;
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  } catch {
    // The game has a software fallback; lack of WebGL must not block loading.
  }
  const module = await import('/client.js');
  await module.homeReady;
  const deadline = performance.now() + 30000;
  while (pending > 0 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 30));
  if (pending || failed.length) throw Error('Certaines ressources n’ont pas pu être chargées.');
  manager.itemStart = start;
  manager.itemEnd = end;
  manager.itemError = error;
  stop();
  document.body.classList.remove('booting');
  loading.remove();
} catch {
  stop();
  document.getElementById('loadingError').hidden = false;
  document.getElementById('loadingRetry').onclick = () => location.reload();
}
