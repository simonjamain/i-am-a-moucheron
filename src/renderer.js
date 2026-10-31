import { applyShadowPreset } from './shadow-settings.js';
export function createRenderer(T, canvas) {
  // A lightweight software renderer keeps the prototype playable without WebGL.
  class SoftwareRenderer {
    constructor(canvas) {
      this.ctx = canvas.getContext('2d');
      this.shadowMap = {};
      this.ratio = 1;
      this.last = 0;
    }
    setPixelRatio(r) {
      this.ratio = Math.min(1, r);
    }
    setSize(w, h) {
      canvas.width = w * this.ratio;
      canvas.height = h * this.ratio;
    }
    render(scene, camera) {
      if (performance.now() - this.last < 40) return;
      this.last = performance.now();
      const ctx = this.ctx;
      if (!ctx) return;
      const w = canvas.width,
        h = canvas.height;
      ctx.fillStyle = scene.background?.getStyle() || '#829f91';
      ctx.fillRect(0, 0, w, h);
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse,
        proj = camera.projectionMatrix,
        faces = [],
        near = Math.max(0.000001, camera.near),
        light = new T.Vector3(-0.4, 0.85, 0.3).normalize();
      scene.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry?.attributes.position) return;
        const a = o.geometry.attributes.position,
          idx = o.geometry.index,
          world = o.matrixWorld,
          mv = new T.Matrix4().multiplyMatrices(view, world),
          count = idx ? idx.count : a.count;
        for (let i = 0; i < count; i += 3) {
          const v = [];
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
          let poly = [];
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
            .map((p) => [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h]);
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
        ctx.beginPath();
        f.points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.globalAlpha = f.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  } catch (e) {
    renderer = new SoftwareRenderer(canvas);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  applyShadowPreset(T, renderer, null);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  return renderer;
}
