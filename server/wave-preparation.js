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

export function prepareRoster(wave, balance, draw = randomInt) {
  const difficulty = 1 + Math.round((wave - 1) * balance.progression);
  const budget = directorBudget(difficulty);
  const types = Object.keys(unlock).filter((type) => difficulty >= unlock[type]);
  const maxCost = Math.max(...types.map((type) => ENEMY_TYPES[type].cost));
  const roster = [];
  let remaining = budget,
    spawn = 0;
  function group(type, count, at) {
    const profile = ENEMY_TYPES[type];
    const portalIndex = draw(profile.ground ? 3 : 4);
    const routeSeed = 1 + draw(0x7fffffff);
    const branch = draw(2);
    const base = {
      type,
      ...profile,
      portalIndex,
      routeSeed,
      branch,
      approach: 'full',
      spawn: at,
      entryHold: 2,
      travelSpeed: profile.speedMps,
    };
    base.duration = 2 + routeDuration(base);
    for (let member = 0; member < count; member++) {
      const id = roster.length;
      roster.push({
        ...base,
        id,
        sourceId: id,
        phase: ((member + draw(1000) / 1000) * Math.PI * 2) / count,
      });
    }
    remaining -= profile.cost * count;
  }
  group('ant', 4 + draw(4), 0);
  group('midge', 8 + draw(5), 2 + draw(4));
  if (difficulty >= 2) group('dart', 1, 3);
  while (remaining > 0) {
    const slots = MAX_WAVE_POPULATION - roster.length;
    // Reserve room for the most expensive species and a remainder of single-point insects.
    const spare = slots - Math.floor(remaining / maxCost) - maxCost;
    const eligible = types.filter((type) => ENEMY_TYPES[type].cost <= remaining);
    const type =
      spare > 0
        ? eligible[draw(eligible.length)]
        : eligible.reduce((a, b) => (ENEMY_TYPES[a].cost >= ENEMY_TYPES[b].cost ? a : b));
    const count = Math.min(
      Math.floor(remaining / ENEMY_TYPES[type].cost),
      Math.max(1, spare),
      1 + draw(Math.max(2, Math.min(70, Math.ceil(budget / 24)))),
    );
    if (!spawn || draw(3) !== 0) spawn += 3 + draw(5);
    group(type, count, spawn);
  }
  const scaled = scaleRoster({ budget, roster }, balance);
  // Copies added by room population arrive with their announced group.
  scaled.roster.forEach((enemy, id) => {
    enemy.spawn = roster[Math.floor((id * roster.length) / scaled.roster.length)].spawn;
  });
  scaled.budget = scaled.roster.reduce((sum, enemy) => sum + enemy.cost, 0);
  return scaled;
}

export function forecast(roster) {
  const groups = new Map();
  for (const enemy of roster) {
    const { type, portalIndex, routeSeed, branch, approach, ground = false, spawn } = enemy;
    const key = [type, portalIndex, routeSeed, branch, spawn].join(':');
    if (!groups.has(key))
      groups.set(key, { type, portalIndex, routeSeed, branch, approach, ground, spawn, count: 0 });
    groups.get(key).count++;
  }
  return [...groups.values()].sort((a, b) => a.spawn - b.spawn);
}
