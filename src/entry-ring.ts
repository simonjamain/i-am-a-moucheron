import type * as THREE from 'three';
import type { Three } from './types.ts';

// Entry circle drawn on the floor around seats and equipment. At the office
// scale the ring is under a pixel wide beyond a few centimetres, so it relied on
// MSAA and on the screen resolution and disappeared for some players. The line is
// computed in the fragment shader instead: its true width (unit ring, radius
// RING_RADIUS) is kept up close, and it never gets thinner than MIN_PIXELS on
// screen. It is anti-aliased by derivatives, independent of the GPU's MSAA.
export const RING_RADIUS = 1.16;
export const RING_HALF_WIDTH = 0.08;
export const RING_MIN_PIXELS = 1.6;
export const RING_MAX_HALF_WIDTH = 0.45;
/** Half side of the quad that hosts the ring (ring units). */
export const RING_QUAD = 1.9;

export function entryRingMaterial(
  T: Three,
  color = '#d5ef73',
  opacity = 0.9,
): THREE.ShaderMaterial {
  return new T.ShaderMaterial({
    uniforms: {
      color: { value: new T.Color(color) },
      opacity: { value: opacity },
      radius: { value: RING_RADIUS },
      halfWidth: { value: RING_HALF_WIDTH },
      minPixels: { value: RING_MIN_PIXELS },
      maxHalfWidth: { value: RING_MAX_HALF_WIDTH },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vLocal;
      void main() {
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color;
      uniform float opacity;
      uniform float radius;
      uniform float halfWidth;
      uniform float minPixels;
      uniform float maxHalfWidth;
      varying vec2 vLocal;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vLocal);
        float pixel = max(fwidth(r), 1e-6);
        float hw = min(maxHalfWidth, max(halfWidth, 0.5 * minPixels * pixel));
        float a = 1.0 - smoothstep(hw - pixel, hw + pixel, abs(r - radius));
        if (a <= 0.01) discard;
        gl_FragColor = vec4(color, opacity * a);
      }`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
}

/** A horizontal quad (rotated flat) carrying the ring; scale it by ACTOR_UNIT. */
export function makeEntryRing(T: Three): THREE.Mesh {
  const mesh = new T.Mesh(new T.PlaneGeometry(RING_QUAD * 2, RING_QUAD * 2), entryRingMaterial(T));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  return mesh;
}
