import type * as THREE from 'three';
import { applyShadowPreset } from './shadow-settings.ts';
import type { Three } from './types.ts';

interface SoftwareFace {
  dot?: [number, number];
  points?: [number, number][];
  distance: number;
  color: string;
  alpha: number;
}

type SoftwareMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial | THREE.MeshBasicMaterial[]
>;

export function createRenderer(T: Three, canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // A lightweight software renderer keeps the prototype playable without WebGL.
  class SoftwareRenderer {
    ctx: CanvasRenderingContext2D | null;
    shadowMap: Partial<THREE.WebGLShadowMap>;
    ratio: number;
    last: number;
    constructor(canvas: HTMLCanvasElement) {
      this.ctx = canvas.getContext('2d');
      this.shadowMap = {};
      this.ratio = 1;
      this.last = 0;
    }
    setPixelRatio(r: number): void {
      this.ratio = Math.min(1, r);
    }
    setSize(w: number, h: number): void {
      canvas.width = w * this.ratio;
      canvas.height = h * this.ratio;
    }
    render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
      if (performance.now() - this.last < 40) return;
      this.last = performance.now();
      const ctx = this.ctx;
      if (!ctx) return;
      const w = canvas.width,
        h = canvas.height;
      ctx.fillStyle = (scene.background as THREE.Color | null)?.getStyle() || '#829f91';
      ctx.fillRect(0, 0, w, h);
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse,
        proj = camera.projectionMatrix,
        faces: SoftwareFace[] = [],
        near = Math.max(0.000001, camera.near),
        light = new T.Vector3(-0.4, 0.85, 0.3).normalize();
      scene.traverseVisible((object) => {
        const o = object as SoftwareMesh;
        if (o.userData.softwareTrail) {
          const a = o.geometry.attributes.position;
          const p = new T.Vector3();
          for (let i = 0; i < a.count; i += 15) {
            p.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).applyMatrix4(view);
            const distance = -p.z;
            if (distance < near) continue;
            p.applyMatrix4(proj);
            if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
            faces.push({
              dot: [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h],
              distance,
              color: (o.material as THREE.MeshBasicMaterial).color.getStyle(),
              alpha: 0.52,
            });
          }
          return;
        }
        if (!o.isMesh || !o.geometry?.attributes.position) return;
        const a = o.geometry.attributes.position,
          idx = o.geometry.index,
          world = o.matrixWorld,
          mv = new T.Matrix4().multiplyMatrices(view, world),
          count = idx ? idx.count : a.count;
        for (let i = 0; i < count; i += 3) {
          const v: THREE.Vector3[] = [];
          for (let j = 0; j < 3; j++)
            v.push(
              new T.Vector3()
                .fromBufferAttribute(a, idx ? idx.getX(i + j) : i + j)
                .applyMatrix4(mv),
            );
          if (v.every((p) => p.z > -near)) continue;
          const n = new T.Vector3()
            .subVectors(v[1], v[0])
            .cross(new T.Vector3().subVectors(v[2], v[0]));
          if (n.dot(v[0]) >= 0) continue;
          let poly: THREE.Vector3[] = [];
          for (let j = 0; j < 3; j++) {
            const A = v[j],
              B = v[(j + 1) % 3],
              insideA = A.z < -near,
              insideB = B.z < -near;
            if (insideA) poly.push(A);
            if (insideA !== insideB) poly.push(A.clone().lerp(B, (-near - A.z) / (B.z - A.z)));
          }
          if (poly.length < 3) continue;
          const normal = n.normalize().transformDirection(camera.matrixWorld),
            brightness = 0.45 + Math.max(0, normal.dot(light)) * 0.65;
          const material = Array.isArray(o.material) ? o.material[0] : o.material;
          const c = material.color.clone().multiplyScalar(brightness);
          // Near-plane-clipped furniture may straddle the camera in a giant room.
          // Sort its visible polygon, not vertices behind the camera.
          const distance = -poly.reduce((s, p) => s + p.z, 0) / poly.length;
          c.lerp(new T.Color('#829f91'), Math.min(0.7, distance / 400));
          const points = poly
            .map((p) => p.clone().applyMatrix4(proj))
            .map((p): [number, number] => [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h]);
          if (
            points.every((p) => p[0] < 0) ||
            points.every((p) => p[0] > w) ||
            points.every((p) => p[1] < 0) ||
            points.every((p) => p[1] > h)
          )
            continue;
          faces.push({
            points,
            distance,
            color: c.getStyle(),
            alpha: material.transparent ? material.opacity : 1,
          });
        }
      });
      faces.sort((a, b) => b.distance - a.distance);
      for (const f of faces) {
        if (f.dot) {
          ctx.fillStyle = f.color;
          ctx.globalAlpha = f.alpha;
          ctx.fillRect(f.dot[0], f.dot[1], 2, 2);
          continue;
        }
        ctx.beginPath();
        f.points!.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.globalAlpha = f.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  } catch (e) {
    // Duck-typed stand-in: callers only use the subset SoftwareRenderer implements.
    renderer = new SoftwareRenderer(canvas) as unknown as THREE.WebGLRenderer;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  applyShadowPreset(T, renderer, null);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  return renderer;
}
