// Small 3D pictures of every shop item, drawn once by a private renderer from
// the real in-game vehicle and service-station models (DCA uses a stand-in).
import { createGraphics } from './graphics.js';
import { makeBed } from './bed-model.js';
import { makeServiceStation } from './station-model.js';

const VEHICLE_MODELS = {
  fighter: 'makePlane',
  bomber: 'makeBomber',
  interceptor: 'makeStuka',
  spitfire: 'makeSpitfire',
  helicopter: 'makeHelicopter',
  flaktruck: 'makeFlakTruck',
  tank: 'makeTank',
  castor: 'makeCastor',
};

function installation(T, kind) {
  if (kind === 'radar' || kind === 'refuel') return makeServiceStation(T, kind);
  if (kind === 'bed') return makeBed(T);
  const g = new T.Group();
  const part = (geometry, color, x, y, z) => {
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, flatShading: true }));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const box = (w, h, d, color, x, y, z) => part(new T.BoxGeometry(w, h, d), color, x, y, z);
  const cyl = (rt, rb, h, color, x, y, z) =>
    part(new T.CylinderGeometry(rt, rb, h, 16), color, x, y, z);
  box(4, 0.3, 3, '#bb8c44', 0, 0.15, 0);
  cyl(0.9, 1.1, 0.8, '#6d7b5a', 0, 0.7, 0);
  box(1.2, 0.9, 1.2, '#557a69', 0, 1.5, 0);
  for (const x of [-0.25, 0.25]) {
    const barrel = cyl(0.1, 0.12, 2.4, '#2c3a33', x, 2.4, -0.9);
    barrel.rotation.x = -Math.PI / 2.8;
  }
  return g;
}

export class ShopThumbnails {
  constructor(T, { width = 240, height = 150 } = {}) {
    this.T = T;
    this.cache = new Map();
    this.scene = new T.Scene();
    this.renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height);
    this.camera = new T.PerspectiveCamera(32, width / height, 0.01, 200);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x556655, 1.5));
    const sun = new T.DirectionalLight(0xfff2d6, 2.2);
    sun.position.set(3, 6, -2);
    this.scene.add(sun);
    const graphics = createGraphics(T, this.scene);
    this.models = new Map();
    for (const [item, make] of Object.entries(VEHICLE_MODELS))
      this.models.set(item, graphics[make]());
    for (const kind of ['bed', 'refuel', 'radar', 'dca']) {
      const model = installation(T, kind);
      this.scene.add(model);
      this.models.set(kind, model);
    }
    for (const model of this.models.values()) {
      model.visible = false;
      model.position.set(0, 0, 0);
      model.quaternion.identity();
      model.scale.setScalar(1);
    }
  }
  has(item) {
    return this.models.has(item);
  }
  // True once every texture used by the item's model has finished decoding.
  ready(item) {
    let ok = true;
    this.models.get(item)?.traverse((o) => {
      const map = o.material?.map;
      // A texture has no image until its file is loaded and decoded.
      if (map && (!map.image || map.image.complete === false)) ok = false;
    });
    return ok;
  }
  render(item) {
    const T = this.T,
      model = this.models.get(item);
    if (!model) return null;
    for (const other of this.models.values()) other.visible = other === model;
    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model),
      center = box.getCenter(new T.Vector3()),
      radius = box.getSize(new T.Vector3()).length() / 2;
    const distance = (radius / Math.sin(T.MathUtils.degToRad(this.camera.fov / 2))) * 0.72;
    // Front three-quarter view, slightly from above. Vehicles face -Z;
    // the supplied service stations have their front on +Z.
    this.camera.position
      .copy(center)
      .addScaledVector(
        new T.Vector3(0.85, 0.55, item === 'radar' || item === 'refuel' ? 1 : -1).normalize(),
        distance,
      );
    this.camera.near = distance / 50;
    this.camera.far = distance * 4;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
  // Picture for an item: waits for its textures, then caches the result.
  picture(item, timeout = 4000) {
    if (!this.has(item)) return Promise.resolve(null);
    if (this.cache.has(item)) return this.cache.get(item);
    const started = Date.now();
    const promise = new Promise((resolve) => {
      const attempt = () => {
        if (this.ready(item) || Date.now() - started > timeout) {
          // One extra frame so the freshly decoded atlas is uploaded to the GPU.
          requestAnimationFrame(() => resolve(this.render(item)));
        } else setTimeout(attempt, 100);
      };
      attempt();
    });
    this.cache.set(item, promise);
    return promise;
  }
}
