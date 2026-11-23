// Where a walking arena lies in the one world (office metres, docs/walking-network.md).
// Every place where people walk (the office deck, Saint Pierre's cloud) keeps its
// own planar arena coordinates for its rules (queue, bays), and a frame turns
// them into world positions: same walker, same physics, same camera everywhere.
import { MAP, PERSON_HEIGHT, HUMANOID_UNITS } from './scale.ts';
import type { XYZ } from './types.ts';

export interface ArenaFrame {
  /** World position (office metres) of the arena origin; y is its floor. */
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  /** Office metres per arena unit. */
  readonly unit: number;
  /** The arena z axis points opposite to the world's (office deck). */
  readonly mirrorZ: boolean;
}

/** Former flight ceiling of the office (LAYOUT_BOUNDS.ceiling, test-arena-frame). */
export const OFFICE_CEILING = 3.95;
/** Height of Saint Pierre's cloud above the office ceiling: about 150 real metres. */
export const PURGATORY_ALTITUDE = MAP.metres(150);
/**
 * Saint Pierre's cloud: above the office, centred on the room. Its arena unit is
 * the purgatory's historic one (2.46 units for a 1.8 m person), so the queue's
 * rules keep their numbers.
 */
export const PURGATORY_FRAME: ArenaFrame = Object.freeze({
  originX: 0,
  originY: OFFICE_CEILING + PURGATORY_ALTITUDE,
  originZ: 0,
  unit: MAP.metres(PERSON_HEIGHT / HUMANOID_UNITS),
  mirrorZ: false,
});

/** World position of an arena point; `y` is a world height (the floor by default). */
export function arenaWorld(f: ArenaFrame, p: { x: number; y?: number | null; z: number }): XYZ {
  return {
    x: f.originX + p.x * f.unit,
    y: p.y ?? f.originY,
    z: f.originZ + (f.mirrorZ ? -p.z : p.z) * f.unit,
  };
}
/** Arena point under a world position. */
export function worldArena(f: ArenaFrame, x: number, z: number): { x: number; z: number } {
  return { x: (x - f.originX) / f.unit, z: (f.mirrorZ ? f.originZ - z : z - f.originZ) / f.unit };
}
