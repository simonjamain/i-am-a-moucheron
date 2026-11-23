import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';
import type { SeatPost } from './seat-posts.ts';
import {
  freezeShadows,
  fullscreenMaterial,
  fullscreenScene,
  targetUv,
  tsl,
  withoutToneMapping,
  type Node,
} from './gpu-passes.ts';

// Hover outline of an aimable post (docs/ui-guidelines.md, « Monter dans un engin »),
// drawn in screen space like the toon outlines (src/toon.ts): the post's parts are
// rendered alone, white on black, into a mask (layer SELECTION_LAYER, never seen by
// the game camera); a full-screen pass then draws a line around the mask's silhouette
// over the finished frame. The whole part stands out from its vehicle, even across
// the vehicle's own surfaces. A shared hull (cockpit, turret glazing) is clipped to a
// sphere around the post. An installation (fixed defence, bed) is outlined whole.
// Signal blue marks a free post. A skinned model (the purgatory's guard) gets a
// skinned mask on the same skeleton, so the line follows its animation. The
// outline pass only covers the screen rectangle of the shown parts (plus the line
// width): its per-pixel search is costly over a whole high-resolution screen.

/** Interaction signal, shared with the CSS token --signal (docs/art-direction.md). */
export const SIGNAL_COLOR = '#2ec4d6';
/** Outline of a post already taken. */
export const TAKEN_COLOR = '#ece8dc';
/** Layer of the mask meshes: rendered only by SelectionOutline. */
export const SELECTION_LAYER = 7;
/** Line width in pixels at 900 px of screen height (toon outlines: 1.5). */
export const SELECTION_WIDTH = 3;
const MAX_RADIUS = 6;

/** Uniforms of a mask material: the sphere that clips a shared hull around the post. */
export interface PostMaskMaterial extends THREE.NodeMaterial {
  uniforms: { clipCentre: { value: THREE.Vector3 }; clipRadius: { value: number } };
}

export function postMaskMaterial(T: Three): PostMaskMaterial {
  const { uniform, vec4, positionWorld, Discard, If, Fn } = tsl(T);
  const uniforms = { clipCentre: uniform(new T.Vector3()), clipRadius: uniform(0) };
  // Skinning is added by the node material itself: the mask follows the animated model.
  const material = new T.NodeMaterial() as PostMaskMaterial;
  const fragment = Fn(() => {
    If(
      uniforms.clipRadius
        .greaterThan(0)
        .and(positionWorld.distance(uniforms.clipCentre).greaterThan(uniforms.clipRadius)),
      () => {
        Discard();
      },
    );
    return vec4(1, 1, 1, 1);
  });
  material.fragmentNode = fragment();
  material.uniforms = uniforms;
  material.side = T.DoubleSide;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

/** Mask meshes currently shown, whatever their post (bounds of the outline pass). */
const shown = new Set<THREE.Mesh>();

/** Mask meshes of one post of one vehicle model, created hidden. */
export class PostHighlight {
  readonly post: SeatPost;
  private readonly T: Three;
  private readonly model: THREE.Object3D;
  private readonly parts: { mesh: THREE.Mesh; material: PostMaskMaterial }[] = [];

  constructor(T: Three, model: THREE.Object3D, post: SeatPost) {
    this.post = post;
    this.T = T;
    this.model = model;
    // No mesh names: every visible part of the model (an installation), except the
    // crew figure it may carry.
    const person = model.userData.person as THREE.Object3D | undefined;
    const sources: THREE.Mesh[] = [];
    if (post.outline.meshes.length)
      for (const name of post.outline.meshes) {
        const source = model.getObjectByName(name) as THREE.Mesh | undefined;
        if (source?.isMesh) sources.push(source);
      }
    else
      model.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.postOutline) return;
        for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p === person) return;
        sources.push(mesh);
      });
    for (const source of sources) {
      const material = postMaskMaterial(T);
      const skinned = source as THREE.SkinnedMesh;
      let mesh: THREE.Mesh;
      if (skinned.isSkinnedMesh) {
        // Same skeleton and bind matrix: the mask moves with the animated model.
        const mask = new T.SkinnedMesh(source.geometry, material);
        mask.bind(skinned.skeleton, skinned.bindMatrix);
        mask.frustumCulled = false;
        mesh = mask;
      } else mesh = new T.Mesh(source.geometry, material);
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
      shown.add(mesh);
    }
  }

  hide(): void {
    for (const { mesh } of this.parts) {
      mesh.visible = false;
      shown.delete(mesh);
    }
  }

  dispose(): void {
    for (const { mesh, material } of this.parts) {
      shown.delete(mesh);
      mesh.removeFromParent();
      material.dispose();
    }
    this.parts.length = 0;
  }
}

/**
 * Drawing-buffer rectangle (origin bottom-left) covering the shown mask meshes,
 * grown by `margin` pixels; the whole screen when a part reaches behind the
 * camera; null when nothing is shown or everything is off screen.
 */
export function selectionRect(
  T: Three,
  camera: THREE.Camera,
  size: { x: number; y: number },
  margin: number,
): { x: number; y: number; w: number; h: number } | null {
  if (!shown.size) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const corner = new T.Vector3(),
    clip = new T.Vector4();
  const viewProjection = new T.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  for (const mesh of shown) {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    // A skinned part moves around its bind pose: a generous box.
    const box = geometry.boundingBox!.clone();
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh)
      box.expandByScalar(0.1 * box.getSize(corner).length());
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        )
        .applyMatrix4(mesh.matrixWorld);
      clip.set(corner.x, corner.y, corner.z, 1).applyMatrix4(viewProjection);
      if (clip.w <= 1e-6) return { x: 0, y: 0, w: size.x, h: size.y };
      const px = ((clip.x / clip.w + 1) / 2) * size.x,
        py = ((clip.y / clip.w + 1) / 2) * size.y;
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  const x = Math.max(0, Math.floor(x0 - margin)),
    y = Math.max(0, Math.floor(y0 - margin)),
    right = Math.min(size.x, Math.ceil(x1 + margin)),
    top = Math.min(size.y, Math.ceil(y1 + margin));
  return right > x && top > y ? { x, y, w: right - x, h: top - y } : null;
}

/** Screen-space outline of the visible mask meshes, over the finished frame. */
export class SelectionOutline {
  /** Line colour, or null when nothing is selected. */
  color: string | null = null;
  private readonly T: Three;
  private readonly renderer: THREE.WebGPURenderer;
  private target: THREE.RenderTarget | null = null;
  private material: THREE.NodeMaterial;
  private quad: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly size: THREE.Vector2;
  private readonly uniforms: Record<'texel' | 'radius' | 'lineColor', Node>;
  private readonly maskTexture: Node;
  /** Half-width of the unrolled search square (grows with the line width). */
  private reach = 0;

  constructor(T: Three, renderer: THREE.WebGPURenderer) {
    this.T = T;
    this.renderer = renderer;
    this.size = new T.Vector2();
    const { uniform, texture } = tsl(T);
    this.uniforms = {
      texel: uniform(new T.Vector2()),
      radius: uniform(SELECTION_WIDTH),
      lineColor: uniform(new T.Color()),
    };
    this.maskTexture = texture(new T.Texture());
    this.material = this.build(MAX_RADIUS);
    const { scene, camera } = fullscreenScene(T, this.material);
    this.quad = scene;
    this.camera = camera;
    this.reach = MAX_RADIUS;
  }

  /**
   * Outline material searching a square of half-width `reach` pixels (a disc of the line
   * width inside it): the loops are unrolled, so the reach is fixed per material.
   */
  private build(reach: number): THREE.NodeMaterial {
    const { vec4, float, select, min, max } = tsl(this.T);
    const { texel, radius, lineColor } = this.uniforms;
    const coord = targetUv(this.T);
    const inside = this.maskTexture.sample(coord).r.greaterThan(0.5);
    let nearest = float(1e3);
    for (let y = -reach; y <= reach; y++)
      for (let x = -reach; x <= reach; x++) {
        const distance = Math.hypot(x, y);
        if (distance > reach) continue;
        const hit = this.maskTexture
          .sample(coord.add(texel.mul([x, y])))
          .r.greaterThan(0.5)
          .and(radius.add(1).greaterThanEqual(distance));
        nearest = min(nearest, select(hit, float(distance), float(1e3)));
      }
    const alpha = max(radius.add(0.5).sub(nearest), 0).clamp(0, 1);
    // Display colours: tone mapping is switched off while this pass draws.
    const material = fullscreenMaterial(this.T, vec4(lineColor, select(inside, float(0), alpha)));
    material.transparent = true;
    return material;
  }

  /** Draw the outline of the selected parts of `scene` over the current frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.color) return;
    const T = this.T,
      renderer = this.renderer,
      size = renderer.getDrawingBufferSize(this.size);
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new T.RenderTarget(size.x, size.y, { depthBuffer: false });
    }
    // Mask pass: only the selection layer, no background, no shadow update.
    const layers = camera.layers.mask,
      background = scene.background,
      restoreShadows = freezeShadows(scene),
      clearColor = renderer.getClearColor(new T.Color()),
      clearAlpha = renderer.getClearAlpha(),
      autoClear = renderer.autoClear;
    camera.layers.set(SELECTION_LAYER);
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    scene.background = background;
    restoreShadows();
    renderer.setClearColor(clearColor, clearAlpha);
    // Outline pass over the finished frame.
    const uniforms = this.uniforms;
    this.maskTexture.value = this.target.texture;
    uniforms.texel.value.set(1 / size.x, 1 / size.y);
    uniforms.radius.value = Math.min(MAX_RADIUS, SELECTION_WIDTH * (size.y / 900));
    uniforms.lineColor.value.set(this.color);
    renderer.setRenderTarget(null);
    const rect = selectionRect(T, camera, size, uniforms.radius.value + 2);
    if (!rect) return;
    // The search square follows the line width (unrolled loops: fixed per material).
    const reach = Math.min(MAX_RADIUS, Math.ceil(uniforms.radius.value + 1));
    if (reach !== this.reach) {
      this.reach = reach;
      const material = this.build(reach);
      (this.quad.children[0] as THREE.Mesh).material = material;
      this.material.dispose();
      this.material = material;
    }
    // Only the pixels that can carry the line: the outline searches a disc of
    // the line width around each pixel.
    const ratio = renderer.getPixelRatio(),
      scissor = renderer.getScissorTest();
    renderer.setScissorTest(true);
    // The scissor rectangle counts from the upper left corner (the rect from the lower left).
    renderer.setScissor(
      rect.x / ratio,
      (size.y - rect.y - rect.h) / ratio,
      rect.w / ratio,
      rect.h / ratio,
    );
    renderer.autoClear = false;
    withoutToneMapping(T, renderer, () => renderer.render(this.quad, this.camera));
    renderer.autoClear = autoClear;
    renderer.setScissorTest(scissor);
    renderer.setScissor(0, 0, size.x / ratio, size.y / ratio);
  }

  dispose(): void {
    this.target?.dispose();
    this.material.dispose();
  }
}
