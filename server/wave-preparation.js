import { randomInt } from 'node:crypto';
import { ENEMY_TYPES, ENEMY_UNLOCK_WAVE, MAX_WAVE_POPULATION } from '../src/waves.js';
import { routeDuration } from '../src/routes.js';
import { scaleRoster, DEFAULT_BALANCE } from '../src/balance.js';

const unlock = ENEMY_UNLOCK_WAVE;

// Wave budget in power: W(n) = W(1) × g^(n − 1), times N^exponent for N players.
// No ceiling: defeat is meant to be unavoidable. It never depends on money earned.
export function directorBudget(wave, players = 1, balance = DEFAULT_BALANCE) {
  const n = Math.max(1, Math.floor(players) || 1);
  return (
    balance.firstWavePower *
    balance.waveGrowth ** (Math.max(1, wave) - 1) *
    n ** balance.playerExponent
  );
}

// Pack sizes: cheap insects come in big swarms (never nearly alone), and the
// bigger and stronger a species is, the more it walks alone. Sizes grow with
// the wave budget, from `min` on the first wave to `max` at a reference power of 2 400.
export const PACKS = Object.freeze({
  midge: { min: 20, max: 400, groups: 3 },
  ant: { min: 8, max: 200, groups: 2 },
  mosquito: { min: 6, max: 60, groups: 2 },
  roach: { min: 2, max: 8 },
  guard: { min: 1, max: 4 },
  brute: { min: 1, max: 2 },
  spider: { min: 1, max: 1 },
  rat: { min: 1, max: 1 },
});
// Flyers wait two seconds at their entrance. Ground creatures only wait briefly
// there, since a pack queuing at a portal would all stand on the same spot; they
// appear just before leaving, one after the other, at the same overall pace.
const PORTAL_HOLD = 2,
  GROUND_HOLD = 0.4;
const holdFor = (profile) => (profile.ground ? GROUND_HOLD : PORTAL_HOLD);
const SWARM_TYPES = new Set(['ant', 'midge', 'mosquito']);
// Only crowds share an entrance and a path; strong species each walk their own.
const SHARED_ROUTE = new Set(['ant', 'midge', 'mosquito']);

export function packSize(type, budget, draw = randomInt) {
  const { min, max } = PACKS[type];
  const progress = Math.min(
    1,
    Math.max(0, Math.log(Math.max(1, budget / 32)) / Math.log(2400 / 32)),
  );
  const target = (min + (max - min) * progress) * (0.75 + draw(501) / 1000);
  return Math.max(min, Math.min(max, Math.round(target)));
}

// Seconds between two members leaving a portal; local soft avoidance spreads
// ground creatures after emergence. Big swarms leave faster.
export function memberGap(type, count) {
  const gaps = { ant: [0.04, 0.09], midge: [0.003, 0.01], mosquito: [0.01, 0.02] };
  const [lowest, highest] = gaps[type] || [0.1, 0.1 * Math.max(1, ENEMY_TYPES[type].power / 4)];
  return Math.max(lowest, Math.min(highest, 8 / Math.max(1, count)));
}

export function prepareRoster(wave, balance, draw = randomInt, players = 1) {
  const difficulty = 1 + Math.round((wave - 1) * balance.progression);
  const budget = directorBudget(difficulty, players, balance);
  const types = Object.keys(unlock).filter((type) => difficulty >= unlock[type]);
  const maxPower = Math.max(...types.map((type) => ENEMY_TYPES[type].power));
  // Phase 1: plan packs. Few, large packs on shared routes keep a wave compact.
  const packs = [],
    routes = new Map();
  let remaining = budget,
    planned = 0,
    spawn = 0;
  function pack(type, count, at) {
    const profile = ENEMY_TYPES[type];
    let route = routes.get(type);
    // Packs of one species mostly follow the same entrance and path.
    if (!route || !SHARED_ROUTE.has(type) || draw(4) === 0) {
      route = {
        portalIndex: draw(profile.ground ? 3 : 4),
        routeSeed: 1 + draw(0x7fffffff),
        branch: draw(2),
      };
      routes.set(type, route);
    }
    packs.push({ type, count, spawn: at, ...route });
    remaining -= profile.power * count;
    planned += count;
  }
  const grow = (type, count) => {
    // Small remainders of a swarm species join an existing pack of that species.
    const target = packs.findLast((p) => p.type === type);
    target.count += count;
    remaining -= ENEMY_TYPES[type].power * count;
    planned += count;
  };
  // Opening packs take a share of the budget each, never less than a real swarm.
  const opening = (type, share) =>
    Math.max(
      1,
      Math.min(
        packSize(type, budget, draw),
        Math.max(PACKS[type].min, Math.floor((budget * share) / ENEMY_TYPES[type].power)),
        Math.floor(remaining / ENEMY_TYPES[type].power),
      ),
    );
  pack('ant', opening('ant', 0.25), 0);
  pack('midge', opening('midge', 0.35), 1 + draw(2));
  while (remaining > 0) {
    const slots = MAX_WAVE_POPULATION - planned;
    // Population ceiling (technical bound): no ceiling on power, so the rest
    // becomes one colossus, a pack of the strongest species with boosted HP.
    if (slots <= 0) break;
    // Reserve room for the most expensive species and a remainder of single-point insects.
    const spare = slots - Math.floor(remaining / maxPower) - maxPower;
    const eligible = types.filter((type) => ENEMY_TYPES[type].power <= remaining);
    // Powers are fractional: stop once the remainder cannot buy the weakest species.
    if (!eligible.length) break;
    const open = eligible.filter(
      (type) =>
        !PACKS[type].groups || packs.filter((p) => p.type === type).length < PACKS[type].groups,
    );
    const choices = open.length ? open : eligible;
    let type;
    if (spare > 0) {
      // Stronger species are drawn more often as the budget grows.
      const weights = choices.map((t) => ENEMY_TYPES[t].power ** 0.5);
      let roll = (draw(1000) / 1000) * weights.reduce((a, b) => a + b, 0);
      type = choices.find((t, i) => (roll -= weights[i]) < 0) || choices.at(-1);
    } else type = eligible.reduce((a, b) => (ENEMY_TYPES[a].power >= ENEMY_TYPES[b].power ? a : b));
    const cost = ENEMY_TYPES[type].power;
    const count = Math.min(
      Math.floor(remaining / cost),
      Math.max(1, spare > 0 ? spare : slots),
      packSize(type, budget, draw),
    );
    if (SWARM_TYPES.has(type) && count < PACKS[type].min && packs.some((p) => p.type === type)) {
      grow(type, count);
      continue;
    }
    // Single strong enemies arrive in bunches, packs one after the other.
    spawn += count === 1 ? (draw(3) === 0 ? 1 : 0) : draw(2) === 0 ? 0 : 1 + draw(3);
    pack(type, count, spawn);
  }
  const top = types.reduce((a, b) => (ENEMY_TYPES[a].power >= ENEMY_TYPES[b].power ? a : b));
  if (remaining >= ENEMY_TYPES[top].power) {
    if (!packs.some((p) => p.type === top)) pack(top, 1, spawn);
    const colossus = packs.findLast((p) => p.type === top);
    colossus.boost = 1 + remaining / (colossus.count * ENEMY_TYPES[top].power);
    remaining = 0;
  }
  // Phase 2: members of a pack are contiguous, so ids follow pack order.
  const roster = [];
  packs.forEach((p, group) => {
    const profile = ENEMY_TYPES[p.type];
    const base = {
      type: p.type,
      ...profile,
      hp: profile.hp * (p.boost || 1),
      power: profile.power * (p.boost || 1),
      group,
      portalIndex: p.portalIndex,
      routeSeed: p.routeSeed,
      branch: p.branch,
      approach: 'full',
      spawn: p.spawn,
      entryHold: holdFor(profile),
      travelSpeed: profile.speedMps,
    };
    base.duration = base.entryHold + routeDuration(base);
    for (let member = 0; member < p.count; member++) {
      const id = roster.length;
      roster.push({
        ...base,
        id,
        sourceId: id,
        phase: ((member + draw(1000) / 1000) * Math.PI * 2) / p.count,
      });
    }
  });
  const scaled = scaleRoster({ budget, roster }, balance);
  // Copies added by room population join their announced pack; members leave
  // the portal one after the other so that none starts on top of another.
  const sizes = new Map(),
    started = new Map();
  for (const enemy of scaled.roster) sizes.set(enemy.group, (sizes.get(enemy.group) || 0) + 1);
  for (const enemy of scaled.roster) {
    const index = started.get(enemy.group) || 0;
    started.set(enemy.group, index + 1);
    enemy.spawn =
      packs[enemy.group].spawn +
      (enemy.ground ? PORTAL_HOLD - GROUND_HOLD : 0) +
      index * memberGap(enemy.type, sizes.get(enemy.group));
  }
  scaled.budget = scaled.roster.reduce((sum, enemy) => sum + enemy.power, 0);
  return scaled;
}

export function forecast(roster) {
  const groups = new Map();
  for (const enemy of roster) {
    const { type, portalIndex, routeSeed, branch, approach, ground = false, spawn } = enemy;
    const key = enemy.group ?? [type, portalIndex, routeSeed, branch, spawn].join(':');
    if (!groups.has(key))
      groups.set(key, { type, portalIndex, routeSeed, branch, approach, ground, spawn, count: 0 });
    const group = groups.get(key);
    group.count++;
    group.spawn = Math.min(group.spawn, spawn);
  }
  return [...groups.values()].sort((a, b) => a.spawn - b.spawn);
}
