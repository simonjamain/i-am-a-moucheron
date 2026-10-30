import { FLAK, REFERENCE, MAP } from './scale.js';
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
  proximity: {
    interval: 0.8,
    damage: 80,
    edge: 20,
    radius: MAP.metres(FLAK.radius),
    speed: MAP.metres(REFERENCE.shell * 0.7),
    lifetime: 6,
  },
  bomb: { interval: 0.5, damage: 240, edge: 60, radius: MAP.metres(20), speed: 0, lifetime: 35 },
  he: {
    interval: 2,
    damage: 120,
    edge: 30,
    radius: MAP.metres(12),
    speed: MAP.metres(320),
    lifetime: 6,
  },
  ap: { interval: 2, damage: 320, edge: 0, radius: 0, speed: MAP.metres(600), lifetime: 4 },
});
export const TANK_MG = Object.freeze({
  pilot: { interval: 0.09, damage: 25 },
  top: { interval: 0.06, damage: 75 },
  coax: { interval: 0.06, damage: 50 },
});
export function availableShell(ammo, selected = 'he') {
  if ((ammo[selected] || 0) >= 1) return selected;
  const other = selected === 'he' ? 'ap' : 'he';
  return (ammo[other] || 0) >= 1 ? other : null;
}
export function heavyDamage(weapon, distance, bonus = 1, radiusFactor = 1) {
  const p = HEAVY[weapon];
  return p && distance <= p.radius * radiusFactor
    ? Math.round(
        (p.damage - ((p.damage - p.edge) * distance) / Math.max(p.radius * radiusFactor, 1e-9)) *
          bonus,
      )
    : 0;
}
export function canUseWeapon(type, seat, key) {
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
          ? seat === 'pilot' && ['interceptor', 'bomber'].includes(type)
          : key === seat && !(type === 'bomber' && seat === 'pilot');
}
