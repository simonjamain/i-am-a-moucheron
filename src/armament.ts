import { MAP } from './scale.ts';
import { PROJECTILES, type ProjectileId } from './projectiles.ts';
import { isBomber } from './fleet.ts';
/** A heavy (explosive or armour-piercing) weapon; distances in map units. */
export interface HeavyWeapon {
  interval: number;
  damage: number;
  edge: number;
  radius: number;
  speed: number;
  lifetime: number;
}
/** A heavy weapon: its own rate of fire on top of its projectile type (src/projectiles.ts). */
const heavy = (id: ProjectileId, interval: number): HeavyWeapon => {
  const p = PROJECTILES[id];
  return {
    interval,
    damage: p.damage,
    edge: p.edge,
    radius: MAP.metres(p.radius),
    speed: MAP.metres(p.speed),
    lifetime: p.lifetime,
  };
};
export const HEAVY = Object.freeze({
  rocket: heavy('rocket', 0.3),
  missile: heavy('missile', 0),
  // Mobile AA shell: same blast as the fixed light flak, only the rate differs.
  proximity: heavy('proximity', 0.8),
  dcaHeavy: heavy('dcaHeavy', 1),
  bomb: heavy('bomb', 0.5),
  he: heavy('he', 2),
  ap: heavy('ap', 2),
  // Fixed anti-materiel howitzer (#113): ballistic like the tank shells, faster
  // than both, more damage than HE on a small 5 m blast.
  antitank: heavy('antitank', 1.8),
} satisfies Record<string, HeavyWeapon>);
export type HeavyKind = keyof typeof HEAVY;
const HEAVY_BY_NAME: Readonly<Record<string, HeavyWeapon | undefined>> = HEAVY;
/** Highest elevation of the medium tank's main gun, in the hull's frame (30°). */
export const TANK_GUN_MAX_PITCH = (30 * Math.PI) / 180;

/** Share of its damage the armour-piercing shell keeps after each enemy it crosses. */
export const AP_PIERCE_KEEP = 0.8;

export const TANK_MG = Object.freeze({
  pilot: { interval: 0.09, projectile: 'mgLight', damage: PROJECTILES.mgLight.damage },
  top: { interval: 0.06, projectile: 'mg', damage: PROJECTILES.mg.damage },
  coax: { interval: 0.06, projectile: 'coax', damage: PROJECTILES.coax.damage },
});
/** Damage per bullet of the Castor driver's machine gun. */
export const CASTOR_GUN_DAMAGE = PROJECTILES.castorGun.damage;
export type Shell = 'he' | 'ap';
export function availableShell(
  ammo: Partial<Record<string, number>>,
  selected: Shell = 'he',
): Shell | null {
  if ((ammo[selected] || 0) >= 1) return selected;
  const other = selected === 'he' ? 'ap' : 'he';
  return (ammo[other] || 0) >= 1 ? other : null;
}
// Seconds between two uses of a heavy weapon on a vehicle: the biplane bomber
// drops its bombs half as fast as the Stuka's rack.
export function heavyInterval(weapon: string, type?: string): number {
  const base = HEAVY_BY_NAME[weapon]?.interval ?? 0;
  return weapon === 'bomb' && type === 'bomber' ? base * 2 : base;
}
export function heavyDamage(weapon: string, distance: number, bonus = 1, radiusFactor = 1): number {
  const p = HEAVY_BY_NAME[weapon];
  return p && distance <= p.radius * radiusFactor
    ? Math.round(
        (p.damage - ((p.damage - p.edge) * distance) / Math.max(p.radius * radiusFactor, 1e-9)) *
          bonus,
      )
    : 0;
}
export function canUseWeapon(type: string, seat: string, key: string): boolean {
  if (type === 'flyingcastor') return false; // unarmed transport
  return type === 'helicopter'
    ? seat === 'pilot'
      ? key === 'rocket'
      : seat === 'copilot' && ['copilot', 'missile'].includes(key)
    : type === 'flaktruck'
      ? seat === 'cannon' && key === 'proximity'
      : type === 'tank'
        ? seat === 'cannon'
          ? ['coax', 'he', 'ap'].includes(key)
          : key === seat
        : key === 'bomb'
          ? seat === 'pilot' && ['interceptor', 'bomber', 'medbomber'].includes(type)
          : key === seat && !(isBomber(type) && seat === 'pilot');
}
