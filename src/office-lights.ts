// Lights of the office: the lamps a layout hangs (lit ceiling fans, desk lamps) and
// the sky and sun shared by every layout. See docs/office-lighting.md.
//
// A layout with lamps is lit by them: each fan throws a soft cone of warm light
// downward whose shadows (furniture, walls) are rendered once, when the room is
// built (`bakeOfficeShadows`), then frozen. The sun then only falls from above,
// for the moving things: once the room is baked, the furniture no longer casts
// into its shadow map, which keeps the landing shadows of aircraft and insects.
// A layout without lamps keeps the legacy slanted sun on everything.
import type * as THREE from 'three';
import type { Three } from './types.ts';
import { type Prop } from './office-props.ts';
import { applyShadowPreset } from './shadow-settings.ts';

export const LAMP_LOOK = Object.freeze({
  /** Lit ceiling fan: warm cone from its globe. */
  fan: Object.freeze({
    color: '#ffcf8f',
    cone: 20,
    angle: 1.15,
    penumbra: 0.95,
    /** Height of the globe below the hanging point (metres). */
    globe: 0.45,
    shadowMap: 1024,
    blur: 4,
    bias: -0.0015,
  }),
  /** Desk lamp: small warm light under its shade, no shadow. */
  desk: Object.freeze({ color: '#ffc27a', power: 0.8, head: [0, 0.31, -0.25] as const }),
  /** Sky and sun of a lamp-lit room: dim sky, sun from above for movers only. */
  sky: Object.freeze({ color: '#f3efe2', ground: '#6b6a5a', intensity: 0.75 }),
  sun: Object.freeze({ color: '#e6ecfb', intensity: 1.6, position: [0.6, 8, -1.6] as const }),
  /** Legacy sky and slanted sun, for layouts without lamps. */
  legacySky: Object.freeze({ color: '#eff3dd', ground: '#50634e' }),
  legacySun: Object.freeze({ color: '#fff4d9', position: [-3, 6, 2] as const }),
  rod: '#2b2622',
});

export type LampKind = 'fan' | 'desk';
export interface Lamp {
  kind: LampKind;
  /** Light position (metres). */
  x: number;
  y: number;
  z: number;
}
/** Lamps of a layout, from its props: lit ceiling fans and desk lamps. */
export function officeLamps(props: readonly Prop[]): Lamp[] {
  const lamps: Lamp[] = [];
  for (const p of props) {
    if (p.model === 'Ceiling_Fan')
      lamps.push({ kind: 'fan', x: p.x, y: p.y - LAMP_LOOK.fan.globe, z: p.z });
    else if (p.model === 'Desk_Lamp') {
      const [u, h, v] = LAMP_LOOK.desk.head;
      const c = Math.cos(p.yaw),
        s = Math.sin(p.yaw);
      lamps.push({ kind: 'desk', x: p.x + c * u + s * v, y: p.y + h, z: p.z - s * u + c * v });
    }
  }
  return lamps;
}

/** Adds the lamps' lights to `parent`; returns the shadow-casting cones. */
export function addOfficeLights(
  T: Three,
  lamps: readonly Lamp[],
  parent: THREE.Object3D,
): THREE.SpotLight[] {
  const cones: THREE.SpotLight[] = [];
  const { fan, desk } = LAMP_LOOK;
  for (const l of lamps) {
    if (l.kind === 'desk') {
      const bulb = new T.PointLight(desk.color, desk.power, 0, 2);
      bulb.position.set(l.x, l.y, l.z);
      parent.add(bulb);
      continue;
    }
    const cone = new T.SpotLight(fan.color, fan.cone, 0, fan.angle, fan.penumbra, 2);
    cone.name = 'lamp-cone';
    cone.position.set(l.x, l.y, l.z);
    cone.target.position.set(l.x, 0, l.z);
    cone.castShadow = true;
    cone.shadow.mapSize.set(fan.shadowMap, fan.shadowMap);
    cone.shadow.radius = fan.blur;
    cone.shadow.bias = fan.bias;
    cone.shadow.camera.near = 0.05;
    // Rendered once (bakeOfficeShadows, or the first frame), never again.
    cone.shadow.autoUpdate = false;
    cone.shadow.needsUpdate = true;
    parent.add(cone, cone.target);
    cones.push(cone);
  }
  return cones;
}

/**
 * Sky and sun for the room (they belong to the scene): dim sky and sun from
 * above when the room has lamps, otherwise the legacy slanted sun.
 */
export function lightRoom(T: Three, scene: THREE.Scene, lit: boolean): void {
  let sky = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as
    THREE.HemisphereLight | undefined;
  let sun = scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as
    THREE.DirectionalLight | undefined;
  if (!sky || !sun) {
    sky = new T.HemisphereLight();
    sun = new T.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
      near: 0.01,
      far: 15,
    });
    sun.shadow.bias = -0.00001;
    scene.add(sky, sun);
  }
  applyShadowPreset(T, null, scene);
  const look = LAMP_LOOK;
  if (lit) {
    sky.color.set(look.sky.color);
    sky.groundColor.set(look.sky.ground);
    sky.intensity = look.sky.intensity;
    sun.color.set(look.sun.color);
    sun.intensity = look.sun.intensity;
    sun.position.set(...look.sun.position);
  } else {
    sky.color.set(look.legacySky.color);
    sky.groundColor.set(look.legacySky.ground);
    sun.color.set(look.legacySun.color);
    sun.position.set(...look.legacySun.position);
  }
  sun.shadow.camera.far = 15;
  sun.shadow.camera.updateProjectionMatrix();
}

/**
 * Renders the lamps' shadow maps once, with the room alone (no aircraft or
 * insect in them), then stops the room from casting into the sun's map, which
 * keeps only the moving things. Returns false when there is nothing to bake.
 */
export function bakeOfficeShadows(
  T: Three,
  renderer: THREE.WebGLRenderer | null | undefined,
  root: THREE.Object3D,
): boolean {
  const cones: THREE.SpotLight[] = [];
  root.traverse((o) => {
    if ((o as THREE.SpotLight).isSpotLight && o.castShadow) cones.push(o as THREE.SpotLight);
  });
  if (!cones.length || !(renderer as { isWebGLRenderer?: boolean } | null)?.isWebGLRenderer)
    return false;
  if (!renderer) return false;
  const parent = root.parent;
  const stage = new T.Scene();
  stage.add(root);
  const target = new T.WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();
  for (const c of cones) c.shadow.needsUpdate = true;
  renderer.setRenderTarget(target);
  renderer.render(stage, new T.PerspectiveCamera());
  renderer.setRenderTarget(previous);
  target.dispose();
  if (parent) parent.add(root);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  return true;
}
