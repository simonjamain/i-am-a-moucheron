// Shared structural types for modules migrated to TypeScript (docs/typescript.md).
// Runtime-free: every export here is a type, erased by Node and the assembler.

/** World coordinates in office metres: x (east), y (up), z (south). */
export type Vec3 = [number, number, number];
/** Horizontal office coordinates [x, z]. */
export type Vec2 = [number, number];
/** Any indexable xyz triple (tuple, Float32Array view, plain array). */
export type Vec3Like = ArrayLike<number>;
/** Mutable xyz object (THREE.Vector3 satisfies it). */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}
/**
 * The three.js namespace injected into scene modules (`createGraphics(T, scene)`): the WebGPU
 * build, which also carries the core classes and TSL (`T.TSL`).
 */
export type Three = typeof import('three/webgpu');

/**
 * Enemy species keys, derived from the `SPECIES` registry of waves.ts (`keyof`), re-exported
 * here for convenience. Exhaustive tables typed `Record<EnemyType, …>` make tsc list every
 * place a new species must be added.
 */
export type { EnemyType } from './waves.ts';
