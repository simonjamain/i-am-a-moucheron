// Manned engineer structures, purchased by a Castor pilot after a team card unlock.
export const FORTIFICATIONS = Object.freeze({
  antitank: Object.freeze({
    name: 'Canon anti-matériel',
    cost: 14,
    hp: 180,
    ammo: 50,
    interval: 1.8,
    // Server shell (HEAVY.antitank): faster and harder-hitting than the tank HE
    // shell, with a much smaller blast.
    damage: 800,
    maxPerRoom: 8,
    // Map-unit radius swept by the player-scale howitzer (muzzle 3.4 m from the
    // axle, #113): placement spacing and collision box.
    footprint: 0.0105,
  }),
});
export type FortificationKind = keyof typeof FORTIFICATIONS;
export const isFortification = (kind: unknown): kind is FortificationKind =>
  Object.hasOwn(FORTIFICATIONS, kind as PropertyKey);
