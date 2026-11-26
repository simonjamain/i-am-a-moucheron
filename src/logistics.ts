import { VEHICLES, pilotFireInterval, isRotorcraft, isBomber } from './fleet.ts';
import { TANK_MG } from './armament.ts';
import type { VehicleProfile } from './fleet.ts';
import type { Vec3Like } from './types.ts';

const PROFILES: Readonly<Record<string, VehicleProfile | undefined>> = VEHICLES;
const TANK_MG_BY_SEAT: Readonly<Record<string, { interval: number } | undefined>> = TANK_MG;

/** Room balance multipliers read by the supply rules. */
export interface SupplyBalance {
  ammo: number;
  fuel: number;
}
/** Rounds left per seat / weapon key. */
export type AmmoLoad = Record<string, number>;
/** A vehicle's supplies: fuel seconds and rounds per seat. */
export interface Supplies {
  fuel: number;
  ammo: AmmoLoad;
}
/** A placed installation (radar, refuel station, DCA, bed…). */
export interface Installation {
  kind: string;
  x: number;
  y: number;
  z: number;
  free?: boolean;
}
/** The motion-state fields read by refuelling and fuel burn. */
export interface SupplyState {
  p: Vec3Like;
  v: readonly number[];
  hp: number;
  landed?: boolean;
  engine?: number | boolean;
  gas?: number;
}
export const FUEL_SECONDS = 300;
export const SERVICE_SECONDS = 10;
// The Castor (and the Castor volant) is a mobile refuel station: a 50 cm
// sphere around the vehicle. Fixed refuel stations use the same reach.
export const CASTOR_SERVICE_RADIUS = 0.5;
export const SERVICE_RADIUS = CASTOR_SERVICE_RADIUS;
export function ammoCapacity(
  type: string,
  seat: string,
  balance: SupplyBalance | null = null,
): number {
  if (balance) return Math.round(ammoCapacity(type, seat) * balance.ammo);
  if (type === 'helicopter')
    return seat === 'rocket' ? 30 : seat === 'missile' ? 10 : seat === 'copilot' ? 1000 : 0;
  if (type === 'castor') return seat === 'pilot' ? 500 : 0;
  if (type === 'flyingcastor') return 0; // unarmed
  if (type === 'flaktruck') return seat === 'proximity' ? 100 : 0;
  if (type === 'tank')
    return seat === 'he' || seat === 'ap'
      ? 30
      : TANK_MG_BY_SEAT[seat]
        ? Math.round(90 / TANK_MG_BY_SEAT[seat].interval)
        : 0;
  if (seat === 'bomb')
    return type === 'bomber' ? 30 : type === 'medbomber' ? 50 : type === 'interceptor' ? 6 : 0;
  if (type === 'spitfire' && seat === 'pilot') return 1000;
  if (!PROFILES[type]?.seats.includes(seat as VehicleProfile['seats'][number])) return 0;
  return isBomber(type) && seat === 'pilot'
    ? 0
    : Math.round(60 / (seat === 'pilot' ? pilotFireInterval(type) : 0.09));
}
export function fullAmmo(type: string, balance: SupplyBalance | null = null): AmmoLoad {
  const keys: readonly string[] =
    type === 'helicopter'
      ? ['rocket', 'missile', 'copilot']
      : type === 'flaktruck'
        ? ['proximity']
        : type === 'flyingcastor'
          ? []
          : type === 'tank'
            ? ['pilot', 'top', 'coax', 'he', 'ap']
            : [
                ...PROFILES[type]!.seats,
                ...(['interceptor', 'bomber', 'medbomber'].includes(type) ? ['bomb'] : []),
              ];
  return Object.fromEntries(keys.map((s) => [s, ammoCapacity(type, s, balance)]));
}
export function inRadarCoverage(
  position: { x: number; z: number },
  installations: readonly Installation[],
): boolean {
  return installations.some(
    (s) => s.kind === 'radar' && Math.hypot(position.x - s.x, position.z - s.z) <= 2,
  );
}
/**
 * Fuel left after `dt` seconds of flight or driving. Refuelling is the paid service
 * (`advancePaidService`, src/paid-service.ts); this only burns: rotorcraft burn 1/s while
 * airborne whatever the thrust, the others in proportion to their throttle.
 */
export function burnFuel(
  fuel: number,
  state: SupplyState,
  type: string,
  dt: number,
  balance: SupplyBalance | null = null,
): number {
  const capacity = FUEL_SECONDS * (balance?.fuel ?? 1);
  const rate = state.engine
    ? isRotorcraft(type)
      ? state.landed
        ? 0
        : -1
      : -Math.max(0, Math.min(1, state.gas ?? (state.landed ? 0 : 0.65)))
    : 0;
  return Math.max(0, Math.min(capacity, fuel + rate * dt));
}
export function vehicleHue(sequence: number): number {
  return (((sequence * 137.50776405003785) % 360) + 360) % 360;
}
export function installationCount(installations: readonly Installation[], kind: string): number {
  return installations.filter((s) => s.kind === kind && !s.free).length;
}
