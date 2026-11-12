// Player appearances: the user-approved Meshy + Mixamo characters a player can
// pick on the home screen (names are not displayed, only read by screen readers). Pure data, shared by the server (validation) and the
// client (selector, models). Order = selector order; the first one is the
// default, also used for unknown or missing values.
export const APPEARANCES = Object.freeze([
  Object.freeze({ id: 'cowboy', name: 'Aventurier' }),
  Object.freeze({ id: 'frontier', name: 'Aventurière' }),
  Object.freeze({ id: 'sky-pilot', name: 'Aviateur' }),
  Object.freeze({ id: 'toby', name: 'Mécanicien' }),
  Object.freeze({ id: 'sunny', name: 'Mécanicienne' }),
  Object.freeze({ id: 'aviator', name: 'Aviatrice' }),
  Object.freeze({ id: 'operator', name: 'Opératrice' }),
]);
export const DEFAULT_APPEARANCE = APPEARANCES[0].id;
const IDS = new Set(APPEARANCES.map((a) => a.id));
export const appearanceId = (value) => (IDS.has(value) ? value : DEFAULT_APPEARANCE);
// Selector step: wraps around both ends.
export function nextAppearance(id, step) {
  const i = APPEARANCES.findIndex((a) => a.id === appearanceId(id));
  const n = APPEARANCES.length;
  return APPEARANCES[(((i + step) % n) + n) % n].id;
}
