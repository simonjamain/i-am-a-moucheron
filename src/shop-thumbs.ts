// Small 3D pictures of every shop item, drawn once by a private renderer from
// the real in-game vehicle and service-station models.
import { createGraphics } from './graphics.ts';
import { makeFixedDca } from './fixed-dca-model.ts';
import { makeBed } from './bed-model.ts';
import { makeServiceStation } from './station-model.ts';
import type * as THREE from 'three/webgpu';
import type { Graphics } from './graphics.ts';
import type { FixedDcaModelKind } from './fixed-dca-model.ts';
import type { Three } from './types.ts';

type InstallationKind = 'bed' | 'refuel' | 'radar' | FixedDcaModelKind;

const VEHICLE_MODELS: Readonly<Record<string, keyof Graphics>> = {
  fighter: 'makePlane',
  bomber: 'makeBomber',
  lightfighter: 'makeLightFighter',
  medbomber: 'makeMediumBomber',
  interceptor: 'makeStuka',
  spitfire: 'makeSpitfire',
  helicopter: 'makeHelicopter',
  flaktruck: 'makeFlakTruck',
  tank: 'makeTank',
  castor: 'makeCastor',
  flyingcastor: 'makeFlyingCastor',
};

function installation(T: Three, kind: InstallationKind): THREE.Group {
  if (kind === 'radar' || kind === 'refuel') return makeServiceStation(T, kind);
  if (kind === 'bed') return makeBed(T);
  return makeFixedDca(T, { kind });
}

export class ShopThumbnails {
  T: Three;
  cache: Map<string, Promise<string | null>>;
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  started: Promise<void>;
  camera: THREE.PerspectiveCamera;
  models: Map<string, THREE.Object3D>;
  constructor(T: Three, { width = 240, height = 150 } = {}) {
    this.T = T;
    this.cache = new Map();
    this.scene = new T.Scene();
    this.renderer = new T.WebGPURenderer({ alpha: true, antialias: true });
    // WebGPU needs an asynchronous start before the first picture.
    this.started = Promise.resolve(this.renderer.init?.()).then(() => {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height);
    });
    this.camera = new T.PerspectiveCamera(32, width / height, 0.01, 200);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x556655, 1.5));
    const sun = new T.DirectionalLight(0xfff2d6, 2.2);
    sun.position.set(3, 6, -2);
    this.scene.add(sun);
    const graphics = createGraphics(T, this.scene);
    this.models = new Map();
    for (const [item, make] of Object.entries(VEHICLE_MODELS))
      this.models.set(item, (graphics[make] as () => THREE.Object3D)());
    for (const kind of ['bed', 'refuel', 'radar', 'dca', 'dcaRapid', 'dcaHeavy'] as const) {
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
  has(item: string): boolean {
    return this.models.has(item);
  }
  // True once every texture used by the item's model has finished decoding.
  ready(item: string): boolean {
    let ok = true;
    this.models.get(item)?.traverse((o) => {
      const map = (o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material
        ?.map as { image?: { complete?: boolean } } | null | undefined;
      // A texture has no image until its file is loaded and decoded.
      if (map && (!map.image || map.image.complete === false)) ok = false;
    });
    return ok;
  }
  render(item: string): string | null {
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
    // A WebGPU canvas is read in the task that drew it: copy it to a 2D canvas.
    const canvas = this.renderer.domElement;
    if (typeof document === 'undefined' || !canvas.width) return canvas.toDataURL('image/png');
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    return copy.toDataURL('image/png');
  }
  // Picture for an item: waits for its textures, then caches the result.
  picture(item: string, timeout = 4000): Promise<string | null> {
    if (!this.has(item)) return Promise.resolve(null);
    if (this.cache.has(item)) return this.cache.get(item)!;
    const started = Date.now();
    const promise = new Promise<string | null>((resolve) => {
      const attempt = () => {
        if (this.ready(item) || Date.now() - started > timeout) {
          // One extra frame so the freshly decoded atlas is uploaded to the GPU.
          this.started.then(() => requestAnimationFrame(() => resolve(this.render(item))));
        } else setTimeout(attempt, 100);
      };
      attempt();
    });
    this.cache.set(item, promise);
    return promise;
  }
}
