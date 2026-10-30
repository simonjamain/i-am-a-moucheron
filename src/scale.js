// The room is modelled in SI metres. Actor reference dimensions/speeds are
// multiplied by this map ratio, never by a second furniture enlargement.
export function mapScale(numerator, denominator = 1000) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0 ||
    numerator > denominator
  )
    throw Error('Invalid map scale');
  const ratio = numerator / denominator;
  return Object.freeze({
    numerator,
    denominator,
    ratio,
    metres: (v) => v * ratio,
    reference: (v) => v / ratio,
  });
}
export const MAPS = Object.freeze({ office: mapScale(3, 1000), purgatory: mapScale(1000, 1000) });
export const MAP = MAPS.office;
export const ACTOR_UNIT = MAP.metres(10.4 / 5.6);
export const HUMAN_SCALE = MAP.metres(1.8 / 2.46);
export const MIDGE_SIZE_FACTOR = 1.35 * 1.5 * 3;
export const INSECT_SCALE = MAP.metres(0.9 / 1.6);
export const REFERENCE = Object.freeze({
  walk: 6,
  enemy: 60 / 3.6,
  bullet: 820,
  shell: 800,
  parachute: 5.5,
  gravity: 9.81,
});
export const FLAK = Object.freeze({
  interval: 0.7,
  minRange: 100,
  maxRange: 1200,
  step: 25,
  range: 300,
  radius: 8,
});
