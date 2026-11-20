// Player appearances: the user-approved Meshy + Mixamo characters a player can
// pick on the home screen (names are not displayed, only read by screen readers). Pure data, shared by the server (validation) and the
// client (selector, models). Order = selector order; the first one is the
// default, also used for unknown or missing values.
export const APPEARANCES = Object.freeze([
  Object.freeze({ id: 'cowboy' as const, name: 'Aventurier' }),
  Object.freeze({ id: 'frontier' as const, name: 'Aventurière' }),
  Object.freeze({ id: 'sky-pilot' as const, name: 'Aviateur' }),
  Object.freeze({ id: 'toby' as const, name: 'Mécanicien' }),
  Object.freeze({ id: 'sunny' as const, name: 'Mécanicienne' }),
  Object.freeze({ id: 'aviator' as const, name: 'Aviatrice' }),
  Object.freeze({ id: 'signaler' as const, name: 'Opérateur' }),
  Object.freeze({ id: 'operator' as const, name: 'Opératrice' }),
]);
export const DEFAULT_APPEARANCE = APPEARANCES[0].id;
export type AppearanceId = (typeof APPEARANCES)[number]['id'];
const IDS: ReadonlySet<unknown> = new Set(APPEARANCES.map((a) => a.id));
export const appearanceId = (value: unknown): AppearanceId =>
  IDS.has(value) ? (value as AppearanceId) : DEFAULT_APPEARANCE;
// Selector step: wraps around both ends.
export function nextAppearance(id: unknown, step: number): AppearanceId {
  const i = APPEARANCES.findIndex((a) => a.id === appearanceId(id));
  const n = APPEARANCES.length;
  return APPEARANCES[(((i + step) % n) + n) % n].id;
}
