import type * as THREE from 'three/webgpu';
import type { Three } from './types.ts';

// Small helpers shared by the screen-space passes written in TSL (selection
// outline, purgatory layers, character picker). See docs/webgpu.md.

// TSL nodes are chained dynamically; the generic typings are too loose to follow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tsl = Record<string, any>;
export const tsl = (T: Three): Tsl => (T as unknown as { TSL: Tsl }).TSL;

/**
 * A full-screen triangle-pair material: `fragment` is the colour node. The vertex stage
 * covers the screen whatever the camera.
 */
export function fullscreenMaterial(T: Three, fragment: Node): THREE.NodeMaterial {
  const { vec4, positionGeometry } = tsl(T);
  const material = new T.NodeMaterial();
  material.vertexNode = vec4(positionGeometry.xy, 0, 1);
  material.fragmentNode = fragment;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

/** Scene and camera that draw `material` over the whole screen (or scissor rectangle). */
export function fullscreenScene(
  T: Three,
  material: THREE.Material,
): { scene: THREE.Scene; camera: THREE.Camera } {
  const scene = new T.Scene();
  scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), material));
  return { scene, camera: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

/** Texture coordinate of the current pixel in a render target's texture (rows run top to bottom). */
export function targetUv(T: Three): Node {
  const { uv, vec2, float } = tsl(T);
  const coord = uv();
  return vec2(coord.x, float(1).sub(coord.y));
}

/**
 * Run `draw` with tone mapping off: a pass that draws over a finished frame (display
 * colours) must not be tone-mapped a second time. Output colour conversion stays.
 */
export function withoutToneMapping(T: Three, renderer: THREE.WebGPURenderer, draw: () => void) {
  const toneMapping = renderer.toneMapping;
  renderer.toneMapping = T.NoToneMapping;
  try {
    draw();
  } finally {
    renderer.toneMapping = toneMapping;
  }
}

type ShadowLight = THREE.Light & { shadow: THREE.LightShadow };

/**
 * Stop the scene's top-level lights re-rendering their shadow maps (an auxiliary pass of
 * the same scene must not pay for them again). Returns the function that restores them.
 */
export function freezeShadows(scene: THREE.Scene): () => void {
  const frozen: [THREE.LightShadow, boolean][] = [];
  for (const child of scene.children) {
    const shadow = (child as ShadowLight).shadow;
    if (!shadow) continue;
    frozen.push([shadow, shadow.autoUpdate]);
    shadow.autoUpdate = false;
  }
  return () => {
    for (const [shadow, autoUpdate] of frozen) shadow.autoUpdate = autoUpdate;
  };
}
