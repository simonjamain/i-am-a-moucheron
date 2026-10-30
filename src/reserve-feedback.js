import { ammoCapacity } from './logistics.js';
export function reserveAlerts(vehicle) {
  if (!vehicle || vehicle.state.hp <= 0) return [];
  const low = (name, value, max) =>
    max > 0 && value / max <= 0.25
      ? `${name} : ${value <= 0 ? 'épuisé' : Math.ceil((value / max) * 100) + ' %'}`
      : null;
  return [
    low('PV', vehicle.state.hp, vehicle.type === 'helicopter' ? 200 : 100),
    low('Carburant', vehicle.supplies.fuel, 300),
    ...Object.entries(vehicle.supplies.ammo).map(([key, value]) =>
      low('Munitions ' + key, value, ammoCapacity(vehicle.type, key)),
    ),
  ].filter(Boolean);
}
export function missileStatus(vehicle, ordnance, now) {
  if (!vehicle || vehicle.type !== 'helicopter') return '';
  if (ordnance.some((s) => s.vehicle === vehicle.id && s.weapon === 'missile' && !s.done))
    return 'Missile en vol';
  if (vehicle.supplies.ammo.missile < 1) return 'Missiles épuisés';
  return now < (vehicle.nextMissileAt || 0) ? 'Missile en cours de rechargement' : '';
}
// Snapshots contain stable arrival IDs; the first snapshot is a baseline, not a replay.
export class ArrivalSignals {
  constructor() {
    this.wave = null;
    this.seen = new Set();
  }
  update(wave, arrived) {
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
