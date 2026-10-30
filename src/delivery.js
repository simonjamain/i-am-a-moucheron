import { MAP, ACTOR_UNIT } from './scale.js';
import { VEHICLES } from './fleet.js';
import { supportedPlacement } from './equipment.js';
export const DELIVERY_SPEED = MAP.metres(1 / 3);
// Absolute server time is shared by simulation and rendering; no accumulated
// snapshot deltas and no visual freeze while waiting for the next snapshot.
export function deliveryHeightAt(delivery, now) {
  const from = delivery.fromY ?? delivery.y;
  const at = delivery.startedAt ?? delivery.at;
  return Math.max(
    delivery.landingY ?? 0.00005,
    from - DELIVERY_SPEED * Math.max(0, (now - at) / 1000),
  );
}
export function deliveryLanding(delivery, solids, occupied = []) {
  const allSolids = [
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
export function deliveryStart(carrier, item, sequence, solids, occupied) {
  const profile = VEHICLES[item];
  const spacing =
    (profile ? Math.max(profile.span, profile.length) * ACTOR_UNIT : MAP.metres(8)) + MAP.metres(8);
  // Spiral reserves distinct nearby columns for repeated drops.
  for (let attempt = 0; attempt < 1024; attempt++) {
    const slot = sequence + attempt,
      angle = slot * 2.399963229728653;
    const radius =
      Math.max(VEHICLES[carrier.type].span, VEHICLES[carrier.type].length) * ACTOR_UNIT +
      spacing * Math.sqrt(slot + 1);
    const d = {
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
