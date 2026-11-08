// Issue #105: show the real physical size of the office (distances in mm/cm/m,
// speeds in cm/s or m/s). Simulation values are already office metres; reference
// metres (vehicle models) are converted with MAP.metres before formatting. These
// helpers only format: physics and balance are untouched.
const decimal = (value, digits) => value.toFixed(digits).replace('.', ',');

export function formatDistance(metres) {
  const m = Math.max(0, Number(metres) || 0);
  if (m < 0.01) return decimal(m * 1000, 1) + ' mm';
  if (m < 1) return decimal(m * 100, m < 0.1 ? 1 : 0) + ' cm';
  return decimal(m, 2) + ' m';
}

export function formatSpeed(metresPerSecond) {
  const v = Math.max(0, Number(metresPerSecond) || 0);
  if (v < 1) return decimal(v * 100, v < 0.1 ? 1 : 0) + ' cm/s';
  return decimal(v, 1) + ' m/s';
}
