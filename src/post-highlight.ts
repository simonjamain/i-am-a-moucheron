import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { SeatPost } from './seat-posts.ts';

// Hover outline of an aimable post (docs/ui-guidelines.md, « Monter dans un engin »),
// drawn in screen space like the toon outlines (src/toon.ts): the post's parts are
// rendered alone, white on black, into a mask (layer SELECTION_LAYER, never seen by
// the game camera); a full-screen pass then draws a line around the mask's silhouette
// over the finished frame. The whole part stands out from its vehicle, even across
// the vehicle's own surfaces. A shared hull (cockpit, turret glazing) is clipped to a
// sphere around the post. Signal blue marks a free post.

/** Interaction signal, shared with the CSS token --signal (docs/art-direction.md). */
export const SIGNAL_COLOR = '#2ec4d6';
/** Outline of a post already taken. */
export const TAKEN_COLOR = '#ece8dc';
/** Layer of the mask meshes: rendered only by SelectionOutline. */
export const SELECTION_LAYER = 7;
/** Line width in pixels at 900 px of screen height (toon outlines: 1.5). */
export const SELECTION_WIDTH = 3;
const MAX_RADIUS = 6;

export function postMaskMaterial(T: Three): THREE.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: {
      clipCentre: { value: new T.Vector3() },
      clipRadius: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 clipCentre;
      uniform float clipRadius;
      varying vec3 vWorld;
      void main() {
        if (clipRadius > 0.0 && distance(vWorld, clipCentre) > clipRadius) discard;
        gl_FragColor = vec4(1.0);
      }`,
    side: T.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
}

/** Mask meshes of one post of one vehicle model, created hidden. */
export class PostHighlight {
  readonly post: SeatPost;
  private readonly T: Three;
  private readonly model: THREE.Object3D;
  private readonly parts: { mesh: THREE.Mesh; material: THREE.ShaderMaterial }[] = [];

  constructor(T: Three, model: THREE.Object3D, post: SeatPost) {
    this.post = post;
    this.T = T;
    this.model = model;
    for (const name of post.outline.meshes) {
      const source = model.getObjectByName(name) as THREE.Mesh | undefined;
      if (!source?.isMesh) continue;
      const material = postMaskMaterial(T);
      const mesh = new T.Mesh(source.geometry, material);
      mesh.name = 'post-outline';
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.layers.set(SELECTION_LAYER);
      mesh.userData = { projectileSolid: false, postOutline: true };
      mesh.raycast = () => {};
      source.add(mesh);
      this.parts.push({ mesh, material });
    }
  }

  /** Put the post in the selection mask; the clip sphere follows the vehicle. */
  show(): void {
    this.model.updateMatrixWorld(true);
    const centre = this.model.localToWorld(new this.T.Vector3(...this.post.local));
    const scale = this.model.getWorldScale(new this.T.Vector3()).x;
    for (const { mesh, material } of this.parts) {
      material.uniforms.clipCentre.value.copy(centre);
      material.uniforms.clipRadius.value = (this.post.outline.clipRadius || 0) * scale;
      mesh.visible = true;
    }
  }

  hide(): void {
    for (const { mesh } of this.parts) mesh.visible = false;
  }

  dispose(): void {
    for (const { mesh, material } of this.parts) {
      mesh.removeFromParent();
      material.dispose();
    }
    this.parts.length = 0;
  }
}

/** Screen-space outline of the visible mask meshes, over the finished frame. */
export class SelectionOutline {
  /** Line colour, or null when nothing is selected. */
  color: string | null = null;
  private readonly T: Three;
  private readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly size: THREE.Vector2;

  constructor(T: Three, renderer: THREE.WebGLRenderer) {
    this.T = T;
    this.renderer = renderer;
    this.size = new T.Vector2();
    this.material = new T.ShaderMaterial({
      uniforms: {
        tMask: { value: null },
        texel: { value: new T.Vector2() },
        radius: { value: SELECTION_WIDTH },
        lineColor: { value: new T.Color() },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tMask;
        uniform vec2 texel;
        uniform float radius;
        uniform vec3 lineColor;
        varying vec2 vUv;
        void main() {
          if (texture2D(tMask, vUv).r > 0.5) discard;
          float nearest = 1e3;
          for (int y = -${MAX_RADIUS}; y <= ${MAX_RADIUS}; y++)
            for (int x = -${MAX_RADIUS}; x <= ${MAX_RADIUS}; x++) {
              vec2 o = vec2(float(x), float(y));
              float d = length(o);
              if (d > radius + 1.0 || d >= nearest) continue;
              if (texture2D(tMask, vUv + o * texel).r > 0.5) nearest = d;
            }
          float alpha = clamp(radius + 0.5 - nearest, 0.0, 1.0);
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(lineColor, alpha);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new T.Scene();
    this.quad.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.material));
    this.camera = new T.Camera();
  }

  /** Draw the outline of the selected parts of `scene` over the current frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.color) return;
    const T = this.T,
      renderer = this.renderer,
      size = renderer.getDrawingBufferSize(this.size);
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new T.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
    }
    // Mask pass: only the selection layer, no background, no shadow update.
    const layers = camera.layers.mask,
      background = scene.background,
      shadows = renderer.shadowMap.autoUpdate,
      clearColor = renderer.getClearColor(new T.Color()),
      clearAlpha = renderer.getClearAlpha(),
      autoClear = renderer.autoClear;
    camera.layers.set(SELECTION_LAYER);
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    scene.background = background;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setClearColor(clearColor, clearAlpha);
    // Outline pass over the finished frame (its colour already in display space).
    const uniforms = this.material.uniforms;
    uniforms.tMask.value = this.target.texture;
    uniforms.texel.value.set(1 / size.x, 1 / size.y);
    uniforms.radius.value = Math.min(MAX_RADIUS, SELECTION_WIDTH * (size.y / 900));
    uniforms.lineColor.value.set(this.color).convertLinearToSRGB();
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.render(this.quad, this.camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.target?.dispose();
    this.material.dispose();
  }
}
