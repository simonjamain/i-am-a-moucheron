import type * as THREE from 'three';
import type { Three } from './types.ts';
import type { SeatPost } from './seat-posts.ts';

// Hover outline of an aimable post (docs/ui-guidelines.md, « Monter dans un engin »):
// the post's meshes are drawn again, back faces only, slightly scaled about the
// post, so only a coloured rim shows around them. A shared hull (cockpit, turret
// glazing) is clipped to a sphere around the post. Signal blue marks a free post.

/** Interaction signal, shared with the CSS token --signal (docs/art-direction.md). */
export const SIGNAL_COLOR = '#2ec4d6';
/** Outline of a post already taken. */
export const TAKEN_COLOR = '#ece8dc';

export function postOutlineMaterial(T: Three, color: string = SIGNAL_COLOR): THREE.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: {
      color: { value: new T.Color(color) },
      centre: { value: new T.Vector3() },
      scale: { value: 1.1 },
      clipCentre: { value: new T.Vector3() },
      clipRadius: { value: 0 },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform vec3 centre;
      uniform float scale;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(centre + (position - centre) * scale, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color;
      uniform vec3 clipCentre;
      uniform float clipRadius;
      varying vec3 vWorld;
      void main() {
        #include <logdepthbuf_fragment>
        if (clipRadius > 0.0 && distance(vWorld, clipCentre) > clipRadius) discard;
        gl_FragColor = vec4(color, 1.0);
      }`,
    side: T.BackSide,
    depthWrite: false,
  });
}

/** Outline meshes of one post of one vehicle model, created hidden. */
export class PostHighlight {
  readonly post: SeatPost;
  private readonly T: Three;
  private readonly model: THREE.Object3D;
  private readonly parts: { mesh: THREE.Mesh; material: THREE.ShaderMaterial }[] = [];

  constructor(T: Three, model: THREE.Object3D, post: SeatPost) {
    this.post = post;
    this.T = T;
    this.model = model;
    model.updateMatrixWorld(true);
    const centre = model.localToWorld(new T.Vector3(...post.local));
    for (const name of post.outline.meshes) {
      const source = model.getObjectByName(name) as THREE.Mesh | undefined;
      if (!source?.isMesh) continue;
      const material = postOutlineMaterial(T);
      material.uniforms.centre.value.copy(source.worldToLocal(centre.clone()));
      material.uniforms.scale.value = post.outline.scale;
      const mesh = new T.Mesh(source.geometry, material);
      mesh.name = 'post-outline';
      mesh.visible = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.renderOrder = 1;
      mesh.userData = { projectileSolid: false, postOutline: true };
      mesh.raycast = () => {};
      source.add(mesh);
      this.parts.push({ mesh, material });
    }
  }

  /** Show the outline in `color`; the clip sphere follows the vehicle. */
  show(color: string): void {
    this.model.updateMatrixWorld(true);
    const centre = this.model.localToWorld(new this.T.Vector3(...this.post.local));
    const scale = this.model.getWorldScale(new this.T.Vector3()).x;
    for (const { mesh, material } of this.parts) {
      material.uniforms.color.value.set(color);
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
