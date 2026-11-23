import type { Three } from './types.ts';
import { tsl, type Node } from './gpu-passes.ts';

// Shared TSL building blocks of every volumetric cloud (sky clouds, floor cloud): value
// noise, fractal noise, two-lobe Henyey-Greenstein phase. Written as plain functions that
// build nodes: octave counts are known when a shader is built, so the loops are unrolled.

export interface CloudNodes {
  hash3(p: Node): Node;
  noise(p: Node): Node;
  /** Fractal Brownian motion with a fixed number of octaves (at most 4). */
  fbm(p: Node, octaves: number): Node;
  /** Henyey-Greenstein phase function. */
  hg(cosine: Node, g: number): Node;
}

export function cloudNodes(T: Three): CloudNodes {
  const { Fn, float, vec3, mix } = tsl(T);
  const hash3 = Fn(([p0]: Node[]) => {
    const p = p0.mul(0.3183099).add(0.1).fract().mul(17).toVar();
    return p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)).fract();
  });
  const noise = Fn(([x]: Node[]) => {
    const i = x.floor(),
      f0 = x.fract();
    const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
    const h = (dx: number, dy: number, dz: number) => hash3(i.add(vec3(dx, dy, dz)));
    return mix(
      mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
      mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
      f.z,
    );
  });
  return {
    hash3,
    noise,
    fbm(p, octaves) {
      let sum: Node = float(0),
        amplitude = 0.5,
        q = p;
      for (let k = 0; k < octaves; k++) {
        sum = sum.add(noise(q).mul(amplitude));
        q = q.mul(2.03).add(vec3(1.7, 9.2, 3.1));
        amplitude *= 0.5;
      }
      return sum;
    },
    hg(cosine, g) {
      const g2 = g * g;
      return float((1 - g2) / (4 * Math.PI)).div(
        float(1 + g2)
          .sub(cosine.mul(2 * g))
          .pow(1.5),
      );
    },
  };
}
