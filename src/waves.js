import { MAP } from './scale.js';
import { baselineTravelSpeed } from './route-speed.js';
import { enemyRoutePosition, routeDuration } from './routes.js';
export const ENEMY_TYPES = Object.freeze({
  ant: {
    name: 'Fourmi',
    cost: 1,
    hp: 100,
    size: 0.8,
    speed: 0.6,
    leak: 1,
    color: '#6e4432',
    ground: true,
  },
  roach: {
    name: 'Cafard',
    cost: 4,
    hp: 300,
    size: 1.2,
    speed: 0.75,
    leak: 2,
    color: '#a36f42',
    ground: true,
  },
  midge: { name: 'Moucheron', cost: 1, hp: 100, size: 1, speed: 1, leak: 1, color: '#bfb36c' },
  dart: { name: 'Voltigeur', cost: 3, hp: 200, size: 0.85, speed: 1.15, leak: 1, color: '#d78253' },
  guard: { name: 'Carapace', cost: 6, hp: 400, size: 1.4, speed: 0.85, leak: 2, color: '#729d8b' },
  brute: {
    name: 'Bourdon blindé',
    cost: 12,
    hp: 800,
    size: 1.9,
    speed: 0.7,
    leak: 3,
    color: '#d0a14b',
  },
});
export function waveBudget(wave) {
  const n = Math.max(1, Math.floor(Number(wave) || 1));
  return Math.min(2400, 6 + 2 * (n - 1) + Math.floor((n - 1) ** 2 / 2));
}
function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const waveCache = new Map();
export function wavePlan(room, wave, started = 0) {
  const key = `${room}:${wave}:${started}`;
  if (waveCache.has(key)) return waveCache.get(key);
  let seed = hash(key),
    remaining = waveBudget(wave);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const roster = [],
    counts = {};
  const unlock = { ant: 3, roach: 6, dart: 4, guard: 8, brute: 12 };
  let eliteSpent = 0;
  while (remaining > 0 && roster.length < 180) {
    const unlocked = Object.entries(ENEMY_TYPES).filter(
      ([name, t]) =>
        t.cost <= remaining &&
        (name === 'midge' ||
          (wave >= unlock[name] &&
            (t.cost === 1 ||
              ((counts[name] || 0) < 1 + Math.floor((wave - unlock[name]) / 3) &&
                eliteSpent + t.cost <= Math.floor(waveBudget(wave) * 0.4))))),
    );
    // At the population ceiling, consolidate the remaining budget into a boss.
    if (roster.length === 179) {
      const hp = ENEMY_TYPES.brute.hp;
      roster.push({
        id: 179,
        type: 'brute',
        ...ENEMY_TYPES.brute,
        hp,
        cost: remaining,
        phase: random() * Math.PI * 2,
      });
      remaining = 0;
      break;
    }
    const [type, profile] = unlocked[Math.floor(random() * unlocked.length)];
    roster.push({ id: roster.length, type, ...profile, phase: random() * Math.PI * 2 });
    remaining -= profile.cost;
    counts[type] = (counts[type] || 0) + 1;
    if (profile.cost > 1) eliteSpent += profile.cost;
  }
  for (const enemy of roster) {
    enemy.entryHold = 2;
    enemy.spawn = Math.floor(enemy.id / 4) * (wave <= 3 ? 3 : 2.4) + (enemy.id % 4) * 0.35;
    const group = Math.floor(enemy.id / 8),
      solo = random() < 0.18;
    enemy.approach = wave <= 3 ? 'intro' : wave <= 6 ? 'short' : 'full';
    enemy.routeSeed = hash(key + ':route:' + (solo ? 'solo' + enemy.id : group));
    enemy.branch = enemy.id % 8 < 3 ? 1 : 0;
    enemy.travelSpeed = baselineTravelSpeed(enemy, wave);
    enemy.duration = enemy.entryHold + routeDuration(enemy);
  }
  const result = { budget: waveBudget(wave), roster };
  if (waveCache.size > 32) waveCache.delete(waveCache.keys().next().value);
  waveCache.set(key, result);
  return result;
}
export function entryStatus(enemy, time) {
  const age = time - enemy.spawn;
  return age < 0
    ? 'pending'
    : age >= enemy.duration
      ? 'arrived'
      : age <= (enemy.entryHold || 0)
        ? 'entry'
        : 'in-flight';
}
// Bounded, deterministic flock flow inspired by Reynolds' separation/cohesion/
// alignment rules. No frame-history dependency: late joiners see the same flock.
// The route guides each cluster; local steering offsets cannot skip the bin.
export function swarmFrame(roster, time) {
  const samples = roster.map((e) => {
    const age = time - e.spawn;
    if (age < 0 || age >= e.duration) return null;
    const hold = e.entryHold || 0;
    const u = Math.max(0, age - hold) / Math.max(0.001, e.duration - hold);
    if (u < 0 || u >= 1) return null;
    const p = enemyRoutePosition(e, u),
      next = enemyRoutePosition(e, Math.min(1, u + 0.0001)),
      tangent = next.map((v, j) => v - p[j]),
      length = Math.hypot(...tangent) || 1,
      envelope = Math.min(1, u * 30, (1 - u) * 30),
      phase = e.phase,
      amplitude = MAP.metres(e.ground ? 1.5 : e.type === 'dart' ? 6 : 4) * envelope;
    for (let j = 0; j < 3; j++)
      if (!e.ground || j !== 1)
        p[j] +=
          amplitude *
          (Math.sin(time * (0.75 + j * 0.17) + phase + j * 2) * 0.65 +
            Math.sin(time * 0.23 + phase * 2 + j) * 0.35);
    return { p, dir: tangent.map((v) => v / length), envelope };
  });
  return samples.map((s, i) => {
    if (!s) return null;
    const correction = [0, 0, 0];
    let neighbours = 0;
    for (let j = 0; j < samples.length; j++) {
      const b = samples[j];
      if (!b || j === i) continue;
      const delta = s.p.map((v, k) => v - b.p[k]),
        d = Math.hypot(...delta);
      if (d > MAP.metres(24) || d < 1e-9) continue;
      neighbours++;
      for (let k = 0; k < 3; k++) {
        correction[k] += -delta[k] * 0.035 + (b.dir[k] - s.dir[k]) * MAP.metres(0.15);
        if (d < MAP.metres(2.8)) correction[k] += (delta[k] / d) * (MAP.metres(2.8) - d) * 0.7;
      }
    }
    const norm = Math.hypot(...correction),
      limit = MAP.metres(2) * s.envelope,
      factor = norm > limit ? limit / norm : 1;
    return {
      p: s.p.map(
        (v, k) =>
          v +
          (roster[i].ground && k === 1 ? 0 : correction[k] * factor) /
            Math.max(1, Math.sqrt(neighbours)),
      ),
      dir: s.dir,
    };
  });
}
