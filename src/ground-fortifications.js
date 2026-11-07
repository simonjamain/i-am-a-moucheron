// Manned engineer structures, purchased by a Castor pilot after a team card unlock.
export const FORTIFICATIONS = Object.freeze({
  bunker: Object.freeze({
    name: 'Bunker LEGO',
    cost: 10,
    hp: 350,
    ammo: 240,
    interval: 0.32,
    damage: 18,
    maxPerRoom: 8,
  }),
  antitank: Object.freeze({
    name: 'Canon anti-matériel',
    cost: 14,
    hp: 180,
    ammo: 24,
    interval: 1.8,
    damage: 225,
    maxPerRoom: 8,
  }),
});
export const isFortification = (kind) => Object.hasOwn(FORTIFICATIONS, kind);
