import { MAP, ACTOR_UNIT } from './scale.ts';
import { VEHICLES } from './fleet.ts';
import { supportedPlacement } from './equipment.ts';
import type { OccupiedSpot, PlacementPoint } from './equipment.ts';
import type { Collider } from './oriented-collider.ts';
import type { VehicleProfile, VehicleType } from './fleet.ts';
import type { Vec3Like } from './types.ts';

const PROFILES: Readonly<Record<string, VehicleProfile | undefined>> = VEHICLES;

/** An airdrop in flight: item key, drop point and optional fall timing. */
export interface Delivery {
  item: string;
  x: number;
  y: number;
  z: number;
  fromY?: number;
  startedAt?: number;
  at?: number;
  landingY?: number;
}
/** The carrier fields read to pick a drop point. */
export interface DeliveryCarrier {
  type: VehicleType;
  state: { p: Vec3Like };
}
// World-space metres per second: the previous scaled 1 mm/s looked stationary
// for several minutes after a drop from a plane above the office furniture;
// 1 m/s then looked like a free fall, so equipment falls three times slower.
export const DELIVERY_SPEED = 1 / 3;
// Absolute server time is shared by simulation and rendering; no accumulated
// snapshot deltas and no visual freeze while waiting for the next snapshot.
export function deliveryHeightAt(delivery: Delivery, now: number): number {
  const from = delivery.fromY ?? delivery.y;
  const at = (delivery.startedAt ?? delivery.at) as number;
  return Math.max(
    delivery.landingY ?? 0.00005,
    from - DELIVERY_SPEED * Math.max(0, (now - at) / 1000),
  );
}
export function deliveryLanding(
  delivery: Delivery,
  solids: readonly Collider[],
  occupied: readonly OccupiedSpot[] = [],
): PlacementPoint | null {
  const allSolids: Collider[] = [
    ...solids,
    { min: { x: -4.15, y: -0.1, z: -3.55 }, max: { x: 4.15, y: 0, z: 3.55 } },
  ];
  const surfaces = allSolids.filter((b) => b.max.y <= delivery.y).sort((a, b) => b.max.y - a.max.y);
  for (const box of surfaces) {
    const point = supportedPlacement(
      { x: delivery.x, y: box.max.y, z: delivery.z },
      allSolids,
      occupied,
      delivery.item,
    );
    if (point && point.y <= delivery.y + 0.0001) return point;
  }
  return null;
}
export function deliveryStart(
  carrier: DeliveryCarrier,
  item: string,
  sequence: number,
  solids: readonly Collider[],
  occupied: readonly OccupiedSpot[],
): Delivery | null {
  const profile = PROFILES[item];
  const spacing =
    (profile ? Math.max(profile.span, profile.length) * ACTOR_UNIT : MAP.metres(8)) + MAP.metres(8);
  // Spiral reserves distinct nearby columns for repeated drops.
  for (let attempt = 0; attempt < 1024; attempt++) {
    const slot = sequence + attempt,
      angle = slot * 2.399963229728653;
    const radius =
      Math.max(VEHICLES[carrier.type].span, VEHICLES[carrier.type].length) * ACTOR_UNIT +
      spacing * Math.sqrt(slot + 1);
    const d: Delivery = {
      item,
      x: carrier.state.p[0] + Math.cos(angle) * radius,
      y: Math.max(carrier.state.p[1], 0) + MAP.metres(8),
      z: carrier.state.p[2] + Math.sin(angle) * radius,
    };
    if (Math.abs(d.x) > 4 || Math.abs(d.z) > 3.4) continue;
    if (occupied.some((s) => Math.hypot(s.x - d.x, s.z - d.z) < spacing)) continue;
    if (deliveryLanding(d, solids, occupied)) return d;
  }
  return null;
}
