import { MAP } from './scale.js';
import { VEHICLES } from './fleet.js';
export const FUEL_SECONDS = 300;
export const SERVICE_SECONDS = 10;
export const SERVICE_RADIUS = 0.12;
export function ammoCapacity(type, seat) {
  return type === 'bomber' && seat === 'pilot'
    ? 0
    : Math.round(60 / (seat === 'pilot' ? 0.06 : 0.09));
}
export function fullAmmo(type) {
  return Object.fromEntries(VEHICLES[type].seats.map((s) => [s, ammoCapacity(type, s)]));
}
export function inRadarCoverage(position, installations) {
  return installations.some(
    (s) =>
      s.kind === 'radar' && Math.hypot(position.x - s.x, position.y - s.y, position.z - s.z) <= 1,
  );
}
export function serviceEligible(state, installations, type) {
  return (
    !!state.landed &&
    state.hp > 0 &&
    Math.hypot(...state.v) <= MAP.metres(0.001) &&
    installations.some(
      (s) =>
        s.kind === 'refuel' &&
        Math.abs(state.p[1] - VEHICLES[type].gear - s.y) <= MAP.metres(0.3) &&
        Math.hypot(state.p[0] - s.x, state.p[2] - s.z) <= SERVICE_RADIUS,
    )
  );
}
export function advanceSupplies(supply, state, type, installations, dt) {
  const servicing = serviceEligible(state, installations, type);
  const fuel = Math.max(
    0,
    Math.min(
      FUEL_SECONDS,
      supply.fuel +
        (servicing
          ? FUEL_SECONDS / SERVICE_SECONDS
          : state.engine
            ? -Math.max(0, Math.min(1, state.gas ?? (state.landed ? 0 : 0.65)))
            : 0) *
          dt,
    ),
  );
  const ammo = { ...supply.ammo };
  if (servicing)
    for (const seat of VEHICLES[type].seats)
      ammo[seat] = Math.min(
        ammoCapacity(type, seat),
        (ammo[seat] || 0) + (ammoCapacity(type, seat) * dt) / SERVICE_SECONDS,
      );
  return { fuel, ammo, servicing };
}
export function vehicleHue(sequence) {
  return (((sequence * 137.50776405003785) % 360) + 360) % 360;
}
export function installationCount(installations, kind) {
  return installations.filter((s) => s.kind === kind && !s.free).length;
}
