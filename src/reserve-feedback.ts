import { ammoCapacity } from './logistics.ts';
import type { AmmoLoad } from './logistics.ts';

/** The vehicle fields read by the reserve alerts (a DCA turret has no fuel). */
export interface ReserveVehicle {
  type: string;
  state: { hp: number };
  supplies: { fuel?: number; ammo: AmmoLoad };
}
/** The vehicle fields read by the missile status line. */
export interface MissileVehicle {
  id: number | string;
  type: string;
  supplies: { ammo: AmmoLoad };
  nextMissileAt?: number;
}
/** The ordnance fields read by the missile status line. */
export interface OrdnanceShot {
  vehicle: number | string;
  weapon: string;
  done?: boolean;
}
/** A wave key or arrival ID: numbers in tests, strings in the client. */
export type ArrivalKey = string | number;

export function reserveAlerts(vehicle: ReserveVehicle | null | undefined): string[] {
  if (!vehicle || vehicle.state.hp <= 0) return [];
  const low = (name: string, value: number, max: number) =>
    max > 0 && value / max <= 0.25
      ? `${name} : ${value <= 0 ? 'épuisé' : Math.ceil((value / max) * 100) + ' %'}`
      : null;
  return [
    low('PV', vehicle.state.hp, vehicle.type === 'helicopter' ? 200 : 100),
    low('Carburant', vehicle.supplies.fuel as number, 300),
    ...Object.entries(vehicle.supplies.ammo).map(([key, value]) =>
      low('Munitions ' + key, value, ammoCapacity(vehicle.type, key)),
    ),
  ].filter(Boolean) as string[];
}
export function missileStatus(
  vehicle: MissileVehicle | null | undefined,
  ordnance: readonly OrdnanceShot[],
  now: number,
): string {
  if (!vehicle || vehicle.type !== 'helicopter') return '';
  if (ordnance.some((s) => s.vehicle === vehicle.id && s.weapon === 'missile' && !s.done))
    return 'Missile en vol';
  if (vehicle.supplies.ammo.missile < 1) return 'Missiles épuisés';
  return now < (vehicle.nextMissileAt || 0) ? 'Missile en cours de rechargement' : '';
}
// Snapshots contain stable arrival IDs; the first snapshot is a baseline, not a replay.
export class ArrivalSignals {
  wave: ArrivalKey | null;
  seen: Set<ArrivalKey>;
  constructor() {
    this.wave = null;
    this.seen = new Set();
  }
  update(wave: ArrivalKey, arrived: readonly ArrivalKey[]): ArrivalKey[] {
    if (wave !== this.wave) {
      this.wave = wave;
      this.seen = new Set(arrived);
      return [];
    }
    const fresh = arrived.filter((id) => !this.seen.has(id));
    for (const id of fresh) this.seen.add(id);
    return fresh;
  }
}
