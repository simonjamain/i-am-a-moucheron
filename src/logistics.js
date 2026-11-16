import { MAP } from './scale.js';
import { VEHICLES, pilotFireInterval, isRotorcraft } from './fleet.js';
import { TANK_MG } from './armament.js';
export const FUEL_SECONDS = 300;
export const SERVICE_SECONDS = 10;
export const SERVICE_RADIUS = 0.12;
// The Castor (and the Castor volant) is a mobile refuel station: a 50 cm
// sphere around the vehicle.
export const CASTOR_SERVICE_RADIUS = 0.5;
export function ammoCapacity(type, seat, balance = null) {
  if (balance) return Math.round(ammoCapacity(type, seat) * balance.ammo);
  if (type === 'helicopter')
    return seat === 'rocket' ? 30 : seat === 'missile' ? 10 : seat === 'copilot' ? 1000 : 0;
  if (type === 'castor') return seat === 'pilot' ? 500 : 0;
  if (type === 'flyingcastor') return 0; // unarmed
  if (type === 'flaktruck') return seat === 'proximity' ? 100 : 0;
  if (type === 'tank')
    return seat === 'he' || seat === 'ap'
      ? 30
      : TANK_MG[seat]
        ? Math.round(90 / TANK_MG[seat].interval)
        : 0;
  if (seat === 'bomb') return type === 'bomber' ? 30 : type === 'interceptor' ? 6 : 0;
  if (type === 'spitfire' && seat === 'pilot') return 1000;
  if (!VEHICLES[type]?.seats.includes(seat)) return 0;
  return type === 'bomber' && seat === 'pilot'
    ? 0
    : Math.round(60 / (seat === 'pilot' ? pilotFireInterval(type) : 0.09));
}
export function fullAmmo(type, balance = null) {
  const keys =
    type === 'helicopter'
      ? ['rocket', 'missile', 'copilot']
      : type === 'flaktruck'
        ? ['proximity']
        : type === 'flyingcastor'
          ? []
          : type === 'tank'
            ? ['pilot', 'top', 'coax', 'he', 'ap']
            : [
                ...VEHICLES[type].seats,
                ...(['interceptor', 'bomber'].includes(type) ? ['bomb'] : []),
              ];
  return Object.fromEntries(keys.map((s) => [s, ammoCapacity(type, s, balance)]));
}
export function inRadarCoverage(position, installations) {
  return installations.some(
    (s) => s.kind === 'radar' && Math.hypot(position.x - s.x, position.z - s.z) <= 2,
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
export function advanceSupplies(supply, state, type, installations, dt, balance = null) {
  const capacity = FUEL_SECONDS * (balance?.fuel ?? 1);
  const servicing = serviceEligible(state, installations, type);
  const fuel = Math.max(
    0,
    Math.min(
      capacity,
      supply.fuel +
        (servicing
          ? capacity / SERVICE_SECONDS
          : state.engine
            ? isRotorcraft(type)
              ? state.landed
                ? 0
                : -1
              : -Math.max(0, Math.min(1, state.gas ?? (state.landed ? 0 : 0.65)))
            : 0) *
          dt,
    ),
  );
  const ammo = { ...supply.ammo };
  if (servicing)
    for (const seat of Object.keys(fullAmmo(type, balance)))
      ammo[seat] = Math.min(
        ammoCapacity(type, seat, balance),
        (ammo[seat] || 0) + (ammoCapacity(type, seat, balance) * dt) / SERVICE_SECONDS,
      );
  return { fuel, ammo, servicing };
}
export function vehicleHue(sequence) {
  return (((sequence * 137.50776405003785) % 360) + 360) % 360;
}
export function installationCount(installations, kind) {
  return installations.filter((s) => s.kind === kind && !s.free).length;
}
