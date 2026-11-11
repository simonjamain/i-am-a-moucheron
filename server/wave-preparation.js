import { randomInt } from 'node:crypto';
import { ENEMY_TYPES, MAX_WAVE_POPULATION } from '../src/waves.js';
import { routeDuration } from '../src/routes.js';
import { scaleRoster } from '../src/balance.js';

const unlock = {
  ant: 1,
  midge: 1,
  dart: 2,
  roach: 3,
  mosquito: 3,
  guard: 5,
  brute: 8,
  spider: 11,
  rat: 15,
};

export function directorBudget(wave) {
  return Math.min(2400, Math.round(32 * 1.5 ** (wave - 1)));
}

// Pack sizes: cheap insects come in big swarms (never nearly alone), and the
// bigger and stronger a species is, the more it walks alone. Sizes grow with
// the wave budget, from `min` on the first wave to `max` at the budget ceiling.
export const PACKS = Object.freeze({
  midge: { min: 20, max: 400, groups: 3 },
  ant: { min: 8, max: 200, groups: 2 },
  mosquito: { min: 6, max: 60, groups: 2 },
  dart: { min: 3, max: 12 },
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
const SHARED_ROUTE = new Set(['ant', 'midge', 'mosquito', 'dart']);

export function packSize(type, budget, draw = randomInt) {
  const { min, max } = PACKS[type];
  const progress = Math.min(1, Math.max(0, Math.log(budget / 32) / Math.log(2400 / 32)));
  const target = (min + (max - min) * progress) * (0.75 + draw(501) / 1000);
  return Math.max(min, Math.min(max, Math.round(target)));
}

// Seconds between two members of one pack leaving the portal: enough, with the
// lanes of `laneOffset`, for ground creatures not to overlap. Big swarms leave faster.
export function memberGap(type, count) {
  const gaps = { ant: [0.04, 0.09], midge: [0.003, 0.01], mosquito: [0.01, 0.02] };
  const [lowest, highest] = gaps[type] || [0.1, 0.1 * Math.max(1, ENEMY_TYPES[type].cost / 4)];
  return Math.max(lowest, Math.min(highest, 8 / Math.max(1, count)));
}

export function prepareRoster(wave, balance, draw = randomInt) {
  const difficulty = 1 + Math.round((wave - 1) * balance.progression);
  const budget = directorBudget(difficulty);
  const types = Object.keys(unlock).filter((type) => difficulty >= unlock[type]);
  const maxCost = Math.max(...types.map((type) => ENEMY_TYPES[type].cost));
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
    remaining -= profile.cost * count;
    planned += count;
  }
  const grow = (type, count) => {
    // Small remainders of a swarm species join an existing pack of that species.
    const target = packs.findLast((p) => p.type === type);
    target.count += count;
    remaining -= ENEMY_TYPES[type].cost * count;
    planned += count;
  };
  // Opening packs take a share of the budget each, never less than a real swarm.
  const opening = (type, share) =>
    Math.max(
      1,
      Math.min(
        packSize(type, budget, draw),
        Math.max(PACKS[type].min, Math.floor((budget * share) / ENEMY_TYPES[type].cost)),
        Math.floor(remaining / ENEMY_TYPES[type].cost),
      ),
    );
  pack('ant', opening('ant', 0.25), 0);
  pack('midge', opening('midge', 0.35), 1 + draw(2));
  if (difficulty >= 2) pack('dart', opening('dart', 0.1), 2 + draw(2));
  while (remaining > 0) {
    const slots = MAX_WAVE_POPULATION - planned;
    // Reserve room for the most expensive species and a remainder of single-point insects.
    const spare = slots - Math.floor(remaining / maxCost) - maxCost;
    const eligible = types.filter((type) => ENEMY_TYPES[type].cost <= remaining);
    const open = eligible.filter(
      (type) =>
        !PACKS[type].groups || packs.filter((p) => p.type === type).length < PACKS[type].groups,
    );
    const choices = open.length ? open : eligible;
    let type;
    if (spare > 0) {
      // Stronger species are drawn more often as the budget grows.
      const weights = choices.map((t) => ENEMY_TYPES[t].cost ** 0.5);
      let roll = (draw(1000) / 1000) * weights.reduce((a, b) => a + b, 0);
      type = choices.find((t, i) => (roll -= weights[i]) < 0) || choices.at(-1);
    } else type = eligible.reduce((a, b) => (ENEMY_TYPES[a].cost >= ENEMY_TYPES[b].cost ? a : b));
    const cost = ENEMY_TYPES[type].cost;
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
  // Phase 2: members of a pack are contiguous, so ids follow pack order.
  const roster = [];
  packs.forEach((p, group) => {
    const profile = ENEMY_TYPES[p.type];
    const base = {
      type: p.type,
      ...profile,
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
  scaled.budget = scaled.roster.reduce((sum, enemy) => sum + enemy.cost, 0);
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
