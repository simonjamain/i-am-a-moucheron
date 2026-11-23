// The cloud the purgatory stands on, drawn as a volume (docs/purgatory-scene.md):
// the same raymarched cloud as the sky's, as a thick layer whose misty top rises
// to the souls' knees, so that everyone walks half inside it.
// - It is a screen pass drawn after the scene (FloorCloud.render): each ray stops
//   at the nearest opaque surface (the scene's depth, from the cartoon renderer's
//   target), so a leg inside the mist is covered only by the cloud in front of it.
// - It is computed at 40 % resolution, keeping the farthest scene depth around
//   each pixel (no sky-coloured halo around the legs), then composited over the
//   frame.
// - Below the walkable hall the top is low and flat; beyond it, the cloud billows
//   up and its edge frays out. Shared physics is unchanged: souls walk at y = 0.
import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import { SKY_LOOK, SUN_DIRECTION } from './purgatory-clouds.ts';
import { cloudNodes } from './cloud-nodes.ts';
import {
  fullscreenMaterial,
  fullscreenScene,
  targetUv,
  tsl,
  withoutToneMapping,
  type Node,
} from './gpu-passes.ts';
import type { CloudFloorSpec } from './purgatory-clouds.ts';

/** Height of the mist's top over the walkable hall (scene units; a soul is 2.46). */
export const FLOOR_MIST = Object.freeze({
  /** Where the mist starts (thin) and where it is fully dense, above the floor. */
  top: 0.95,
  dense: -0.35,
  /** Margin around the hall before the cloud billows up, and their height. */
  margin: 2.5,
  billows: 3,
  /** Lowest point of the cloud's belly. */
  bottom: -7,
});
/** Resolution of the floor pass, per screen axis. */
export const FLOOR_LAYER_SCALE = 0.4;

export interface FloorCloud {
  /**
   * Draw the floor cloud over the current frame, for `camera`, stopping at the
   * scene depth `depth` (the cartoon renderer's target; null: no occlusion).
   */
  render(renderer: THREE.WebGPURenderer, camera: THREE.Camera, depth: THREE.Texture | null): void;
  setMood(mood: 'normal' | 'super'): void;
  dispose(): void;
}

export function createFloorCloud(
  T: Three,
  hall: CloudFloorSpec,
  extent: CloudFloorSpec,
): FloorCloud {
  const {
    Fn,
    If,
    Break,
    Continue,
    Discard,
    Loop,
    uniform,
    texture,
    uv,
    vec2,
    vec3,
    vec4,
    float,
    screenCoordinate,
    smoothstep,
    mix,
    max,
    min,
    abs,
    exp,
    pow,
    select,
    length,
    clamp,
    toneMapping,
  } = tsl(T);
  const { hash3, noise, fbm, hg } = cloudNodes(T);
  const rect = (r: CloudFloorSpec) => new T.Vector4(r.minX, r.maxX, r.minZ, r.maxZ);
  // The margin before the billows: the hall grown on every side.
  const flat = rect(hall).add(
    new T.Vector4(-FLOOR_MIST.margin, FLOOR_MIST.margin, -FLOOR_MIST.margin, FLOOR_MIST.margin),
  );
  const u = {
    hasDepth: uniform(0),
    depthTexel: uniform(new T.Vector2()),
    near: uniform(0.1),
    far: uniform(1000),
    projectionInverse: uniform(new T.Matrix4()),
    cameraWorld: uniform(new T.Matrix4()),
    eye: uniform(new T.Vector3()),
    time: uniform(0),
    hall: uniform(flat), // minX, maxX, minZ, maxZ (flat top)
    extent: uniform(rect(extent)), // minX, maxX, minZ, maxZ (whole cloud)
    // top, dense, billows, bottom
    mist: uniform(
      new T.Vector4(FLOOR_MIST.top, FLOOR_MIST.dense, FLOOR_MIST.billows, FLOOR_MIST.bottom),
    ),
    sunDir: uniform(new T.Vector3(...SUN_DIRECTION).normalize()),
    sunColor: uniform(new T.Color(SKY_LOOK.normal.sun)),
    shade: uniform(new T.Color(SKY_LOOK.shade)),
    tint: uniform(new T.Color(SKY_LOOK.cloud)),
  };
  const depthTexture = texture(new T.DepthTexture(1, 1));
  const layerTexture = texture(new T.Texture());
  const mist = u.mist,
    sunDir = u.sunDir;
  // Distance from p to the rectangle r (0 inside).
  const outside = (p: Node, r: Node) => {
    const d = max(vec2(r.x.sub(p.x), r.z.sub(p.y)), vec2(p.x.sub(r.y), p.y.sub(r.w)));
    return length(max(d, 0));
  };
  // Signed distance to the rectangle r (negative inside).
  const boxSd = (p: Node, r: Node) => {
    const c = vec2(r.x.add(r.y), r.z.add(r.w)).mul(0.5),
      h = vec2(r.y.sub(r.x), r.w.sub(r.z)).mul(0.5);
    const q = abs(p.sub(c)).sub(h);
    return length(max(q, 0)).add(min(max(q.x, q.y), 0));
  };
  // Top of the cloud at (x, z): low mist over the hall, billows beyond it.
  const topAt = (xz: Node) => {
    const rise = smoothstep(0, 5, outside(xz, u.hall));
    const lumps = noise(vec3(xz.mul(0.22), u.time.mul(0.03)));
    return mist.x
      .add(lumps.sub(0.5).mul(0.25))
      .add(rise.mul(mist.z).mul(lumps.mul(0.45).add(0.55)));
  };
  const density = (p: Node, octaves: number) => {
    const top = topAt(p.xz);
    const layer = smoothstep(top, top.sub(mist.x.sub(mist.y)), p.y);
    const belly = smoothstep(mist.w, mist.w.add(2.5), p.y);
    const edge = float(1).sub(
      smoothstep(
        -3,
        1.5,
        boxSd(p.xz, u.extent).add(
          noise(vec3(p.xz.mul(0.15), 3))
            .sub(0.5)
            .mul(6),
        ),
      ),
    );
    const n = p
      .mul(vec3(0.55, 0.9, 0.55))
      .add(vec3(u.time.mul(0.05), u.time.mul(-0.02), u.time.mul(0.03)));
    const puffs = fbm(n, octaves).sub(0.5);
    // Noise only shapes the top band: nothing floats above top + 0.45.
    const band = smoothstep(top.add(0.45), top.sub(0.25), p.y);
    return layer.mul(1.4).add(puffs.mul(1.2)).mul(band).mul(belly).mul(edge).clamp(0, 1);
  };
  // View distance stored in the logarithmic depth buffer (as src/toon.ts reads it).
  const sceneDepth = (coord: Node) => {
    const at = (offset: Node) => depthTexture.sample(coord.add(offset)).r;
    const t = u.depthTexel;
    // The farthest of four depth samples spread over this layer pixel.
    const d = max(max(at(vec2(0, 0)), at(vec2(t.x, 0))), max(at(vec2(0, t.y)), at(t)));
    const view = u.near.mul(pow(u.far.div(u.near), d));
    return select(u.hasDepth.lessThan(0.5).or(d.greaterThanEqual(0.99999)), float(1e6), view);
  };
  const march = Fn(() => {
    const vUv = uv();
    const ndc = vec4(vUv.mul(2).sub(1), 1, 1);
    const view = u.projectionInverse.mul(ndc);
    const viewDir = view.xyz.div(view.w).normalize();
    const rd = u.cameraWorld.mul(vec4(viewDir, 0)).xyz.normalize();
    const eye = u.eye;
    // Distance along the ray to the nearest opaque surface.
    const sampleUv = targetUv(T);
    const tScene = sceneDepth(sampleUv.sub(u.depthTexel.mul(0.5))).div(
      max(viewDir.z.negate(), 1e-4),
    );
    const yTop = mist.x.add(mist.z).add(0.5);
    // Slab [bottom, yTop].
    const flatRay = abs(rd.y).lessThan(1e-5);
    If(flatRay.and(eye.y.greaterThan(yTop).or(eye.y.lessThan(mist.w))), () => {
      Discard();
    });
    const a = yTop.sub(eye.y).div(rd.y),
      b = mist.w.sub(eye.y).div(rd.y);
    const t0 = select(flatRay, float(0), max(min(a, b), 0));
    const t1 = min(min(select(flatRay, float(200), max(a, b)), tScene), 160);
    If(t0.greaterThanEqual(t1), () => {
      Discard();
    });
    const L = sunDir.normalize();
    const mu = rd.dot(L);
    const phase = hg(mu, 0.55).mul(0.7).add(hg(mu, -0.3).mul(0.3));
    const color = vec3(0).toVar();
    const alpha = float(0).toVar();
    const t = t0.add(hash3(vec3(screenCoordinate.xy, u.time.fract())).mul(0.15)).toVar();
    Loop(64, () => {
      If(alpha.greaterThan(0.97).or(t.greaterThan(t1)), () => {
        Break();
      });
      const p = eye.add(rd.mul(t));
      // Above the cloud's surface here: jump down to it (empty-space skipping),
      // so that far rays still reach the cloud within the step budget.
      const surface = topAt(p.xz).add(0.5);
      If(p.y.greaterThan(surface), () => {
        If(rd.y.greaterThan(-0.002).and(p.y.greaterThan(yTop)), () => {
          Break();
        });
        t.addAssign(
          select(
            rd.y.lessThan(-0.002),
            clamp(p.y.sub(surface).div(rd.y.negate()), 0.1, 12),
            float(1),
          ),
        );
        Continue();
      });
      const dt = t.mul(0.03).add(0.1);
      const d = density(p, 3);
      If(d.greaterThan(0.01), () => {
        const toward = density(p.add(L.mul(0.7)), 1).mul(1.8);
        const beer = exp(toward.mul(-1.6));
        const powder = float(1).sub(exp(d.mul(-5)));
        const light = beer.mul(mix(1, powder, 0.4));
        // Deeper in the cloud, bluer.
        const depthShade = smoothstep(mist.w, mist.x, p.y);
        const c = mix(u.shade, u.tint, light.mul(depthShade.mul(0.45).add(0.55)))
          .add(u.sunColor.mul(phase.add(0.22)).mul(light))
          .add(
            u.sunColor
              .mul(pow(max(mu, 0), 6))
              .mul(float(1).sub(d))
              .mul(0.4),
          );
        const a2 = float(1).sub(exp(d.mul(min(dt, t1.sub(t))).mul(-3.2)));
        color.addAssign(c.mul(a2).mul(float(1).sub(alpha)));
        alpha.addAssign(a2.mul(float(1).sub(alpha)));
      });
      t.addAssign(dt);
    });
    // A ray that reaches the dense layer (inside the cloud's extent) before any
    // opaque surface without filling up: the rest is cloud, never a hole to the sky.
    If(alpha.lessThan(0.97).and(rd.y.lessThan(0)), () => {
      const tDense = mist.y.sub(eye.y).div(rd.y);
      const under = eye.add(rd.mul(tDense));
      If(
        tDense
          .greaterThan(0)
          .and(tDense.lessThan(tScene))
          .and(boxSd(under.xz, u.extent).lessThan(-3)),
        () => {
          // Lit like the mist's surface seen from afar.
          color.addAssign(
            mix(u.shade, u.tint, 0.8).add(u.sunColor.mul(0.2)).mul(float(1).sub(alpha)),
          );
          alpha.assign(1);
        },
      );
    });
    If(alpha.lessThan(0.003), () => {
      Discard();
    });
    return vec4(color, alpha);
  });
  const marchMaterial = fullscreenMaterial(T, march());
  // Premultiplied accumulation into the cleared layer.
  marchMaterial.blending = T.CustomBlending;
  marchMaterial.blendSrc = T.OneFactor;
  marchMaterial.blendDst = T.ZeroFactor;
  // Composite of the half-resolution layer (premultiplied, linear) over the frame. The frame
  // below is already tone-mapped (src/toon.ts), so the layer is tone-mapped here, and the
  // renderer's own tone mapping is off while this draws.
  const exposure = uniform(1);
  const layer = layerTexture.sample(targetUv(T));
  const compositeMaterial = fullscreenMaterial(
    T,
    Fn(() => {
      If(layer.a.lessThan(0.003), () => {
        Discard();
      });
      return vec4(
        toneMapping(T.ACESFilmicToneMapping, exposure, layer.rgb.div(layer.a)).rgb,
        layer.a,
      );
    })(),
  );
  compositeMaterial.transparent = true;
  const { scene: marchScene, camera: screen } = fullscreenScene(T, marchMaterial);
  const { scene: compositeScene } = fullscreenScene(T, compositeMaterial);
  marchScene.children[0].frustumCulled = false;
  compositeScene.children[0].frustumCulled = false;
  let target: THREE.RenderTarget | null = null;
  const size = new T.Vector2(),
    clear = new T.Color();
  const start = performance.now();
  return {
    render(renderer, camera, depth) {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.round(size.x * FLOOR_LAYER_SCALE)),
        h = Math.max(1, Math.round(size.y * FLOOR_LAYER_SCALE));
      if (!target) target = new T.RenderTarget(w, h, { type: T.HalfFloatType });
      else if (target.width !== w || target.height !== h) target.setSize(w, h);
      camera.updateMatrixWorld();
      const perspective = camera as THREE.PerspectiveCamera;
      if (depth) depthTexture.value = depth;
      u.hasDepth.value = depth ? 1 : 0;
      // Spread of the depth samples: most of one layer pixel.
      u.depthTexel.value.set(0.6 / w, 0.6 / h);
      u.near.value = perspective.near ?? 0.1;
      u.far.value = perspective.far ?? 1000;
      u.projectionInverse.value.copy(camera.projectionMatrixInverse);
      u.cameraWorld.value.copy(camera.matrixWorld);
      u.eye.value.setFromMatrixPosition(camera.matrixWorld);
      u.time.value = (performance.now() - start) / 1000;
      const previous = renderer.getRenderTarget(),
        alpha = renderer.getClearAlpha(),
        autoClear = renderer.autoClear;
      renderer.getClearColor(clear);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(marchScene, screen);
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      layerTexture.value = target.texture;
      renderer.autoClear = false;
      exposure.value = renderer.toneMappingExposure;
      withoutToneMapping(T, renderer, () => renderer.render(compositeScene, screen));
      renderer.autoClear = autoClear;
    },
    setMood(mood) {
      u.sunColor.value.set(SKY_LOOK[mood].sun);
    },
    dispose() {
      target?.dispose();
      marchMaterial.dispose();
      compositeMaterial.dispose();
    },
  };
}
