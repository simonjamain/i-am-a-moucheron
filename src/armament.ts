import { FLAK, REFERENCE, MAP } from './scale.ts';
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
export const HEAVY = Object.freeze({
  rocket: {
    interval: 0.3,
    damage: 120,
    edge: 30,
    radius: MAP.metres(12),
    speed: MAP.metres(180),
    lifetime: 6,
  },
  missile: {
    interval: 0,
    damage: 80,
    edge: 20,
    radius: MAP.metres(FLAK.radius),
    speed: MAP.metres(100),
    lifetime: 10,
  },
  // Mobile AA shell: same blast as the fixed light flak, only the rate differs.
  proximity: {
    interval: 0.8,
    damage: 80,
    edge: 20,
    radius: MAP.metres(FLAK.lightRadius),
    speed: MAP.metres(REFERENCE.shell * 0.7),
    lifetime: 6,
  },
  dcaHeavy: {
    interval: 1,
    damage: 240,
    edge: 60,
    radius: MAP.metres(40),
    speed: MAP.metres(REFERENCE.shell * 0.7),
    lifetime: 6,
  },
  bomb: { interval: 0.5, damage: 240, edge: 60, radius: MAP.metres(20), speed: 0, lifetime: 35 },
  he: {
    interval: 2,
    damage: 320,
    edge: 30,
    radius: MAP.metres(20),
    speed: MAP.metres(320),
    // Long enough to cross the whole office (issue #103); walls still stop it.
    lifetime: 13,
  },
  ap: { interval: 2, damage: 800, edge: 0, radius: 0, speed: MAP.metres(600), lifetime: 8 },
  // Fixed anti-materiel howitzer (#113): ballistic like the tank shells, faster
  // than both, more damage than HE on a small 5 m blast.
  antitank: {
    // Same values as FORTIFICATIONS.antitank (no import, to keep this
    // module light; scripts/test-howitzer.mjs checks they match).
    interval: 1.8,
    damage: 800,
    edge: 90,
    radius: MAP.metres(5),
    speed: MAP.metres(750),
    lifetime: 8,
  },
} satisfies Record<string, HeavyWeapon>);
export type HeavyKind = keyof typeof HEAVY;
const HEAVY_BY_NAME: Readonly<Record<string, HeavyWeapon | undefined>> = HEAVY;
/** Highest elevation of the medium tank's main gun, in the hull's frame (30°). */
export const TANK_GUN_MAX_PITCH = (30 * Math.PI) / 180;

/** Share of its damage the armour-piercing shell keeps after each enemy it crosses. */
export const AP_PIERCE_KEEP = 0.8;

export const TANK_MG = Object.freeze({
  pilot: { interval: 0.09, damage: 33 },
  top: { interval: 0.06, damage: 75 },
  coax: { interval: 0.06, damage: 50 },
});
/** Damage per bullet of the Castor driver's machine gun. */
export const CASTOR_GUN_DAMAGE = 40;
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
