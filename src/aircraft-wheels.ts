import type * as THREE from 'three';
import { MODEL_TO_REF, planeSpec } from './plane-physics.ts';

// The main wheels of the aircraft (rig-biplane-wheels.mjs, rig-aircraft-wheels.mjs): parts
// of the model pivoting on their hubs, lifted by the spring compression of the aircraft's
// physics (plane-physics.ts) and spun by the ground speed.

/** Registers the wheel nodes of a model (`wheelL`, `wheelR`) for `poseWheels`. */
export function rigWheels(
  model: THREE.Object3D,
  nodes: Record<string, THREE.Object3D>,
  type: string,
): void {
  const wheels = [nodes.wheelL, nodes.wheelR];
  for (const wheel of wheels) wheel.userData.restY = wheel.position.y;
  model.userData.wheels = wheels;
  model.userData.wheelRadius = planeSpec(type).wheelRadius;
  model.userData.gearSag = planeSpec(type).sag;
}
/** Lifts the wheels by the springs' compression (reference metres) and turns them. */
export function poseWheels(model: THREE.Object3D, compression: readonly number[], spin = 0): void {
  const wheels = model.userData.wheels as THREE.Object3D[] | undefined;
  if (!wheels) return;
  wheels.forEach((wheel, i) => {
    // Only the wheels registered by `rigWheels`: the Castor's six wheels (userData.wheels too)
    // have no rest height, and `undefined + x` made them vanish (NaN position).
    if (typeof wheel.userData.restY !== 'number') return;
    wheel.position.y = wheel.userData.restY + (compression[i] ?? 0) / MODEL_TO_REF;
    wheel.rotation.x += spin;
  });
}
/** What an aircraft that nobody simulates here shows: parked springs sag, flying ones extend. */
export function parkedCompression(model: THREE.Object3D, landed: boolean): number[] {
  const sag = (model.userData.gearSag as number | undefined) ?? 0;
  return landed ? [sag, sag] : [0, 0];
}
