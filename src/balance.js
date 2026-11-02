import { assignMidgeSwarmSizes } from './waves.js';

// Room-local settings. No mutable module-level gameplay configuration.
export const BALANCE_FIELDS = Object.freeze({
  population: {
    label: 'Quantité d’ennemis',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochaine vague',
  },
  progression: {
    label: 'Progression de la difficulté',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochaine vague, déblocages compris',
  },
  enemyHP: {
    label: 'PV des ennemis du bureau',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Immédiat, proportion de vie conservée',
  },
  enemySpeed: {
    label: 'Vitesse des ennemis',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Immédiat, sans déplacement brusque',
  },
  damage: {
    label: 'Dégâts des armes',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochain impact léger / prochain tir lourd, alliés compris',
  },
  fireRate: {
    label: 'Cadence des armes automatiques et lourdes',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochain tir (pistolet semi-automatique inchangé)',
  },
  ammo: {
    label: 'Capacité des munitions',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Immédiat, proportion restante conservée',
  },
  fuel: {
    label: 'Capacité de carburant',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Immédiat, proportion restante conservée',
  },
  prices: {
    label: 'Prix des achats',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochain achat, bons payés inchangés',
  },
  rewards: {
    label: 'Récompenses en dollars',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochain gain, prêts signés inchangés',
  },
  startingMoney: {
    label: 'Argent de départ ($)',
    min: 0,
    step: 1,
    value: 0,
    when: 'Prochaine remise à zéro de la partie',
  },
  initialDelay: {
    label: 'Délai initial (secondes)',
    min: 5,
    step: 1,
    value: 10,
    when: 'Compte à rebours initial, préavis minimum de 5 secondes',
  },
  pause: {
    label: 'Pause entre vagues (secondes)',
    min: 5,
    step: 1,
    value: 60,
    when: 'Pause en cours, préavis minimum de 5 secondes',
  },
});
export const DEFAULT_BALANCE = Object.freeze(
  Object.fromEntries(Object.entries(BALANCE_FIELDS).map(([key, field]) => [key, field.value])),
);
export function validateBalance(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw Error('Réglages invalides.');
  for (const [key, value] of Object.entries(patch)) {
    const field = Object.hasOwn(BALANCE_FIELDS, key) && BALANCE_FIELDS[key];
    if (
      !field ||
      !Number.isFinite(value) ||
      value < field.min ||
      Math.abs((value - field.min) / field.step - Math.round((value - field.min) / field.step)) >
        1e-7
    )
      throw Error('Réglage invalide : ' + key);
  }
  return patch;
}
export const money = (value, factor = 1) => Math.round(value * factor * 100) / 100;
export function scaleRoster(plan, balance) {
  const original = plan.roster;
  const count = Math.max(1, Math.round(original.length * balance.population));
  // Spread reduced populations across the original composition rather than removing late species.
  const roster = Array.from({ length: count }, (_, id) => {
    const sourceIndex = Math.floor((id * original.length) / count);
    const source = original[sourceIndex];
    const member = id - Math.ceil((sourceIndex * count) / original.length);
    return {
      ...source,
      id,
      hp: source.hp * balance.enemyHP,
      phase: source.phase + (member * Math.PI * 2) / Math.ceil(count / original.length),
      spawn: source.spawn + member * 0.07,
      duration: source.duration / balance.enemySpeed,
      entryHold: source.entryHold / balance.enemySpeed,
      travelSpeed: source.travelSpeed * balance.enemySpeed,
    };
  });
  return { budget: plan.budget, roster: assignMidgeSwarmSizes(roster) };
}
export function retimeRoster(roster, time, ratio) {
  for (const enemy of roster) {
    // Scale the entire age and duration together, preserving route progress and entry hold.
    if (time >= enemy.spawn) enemy.spawn = time - (time - enemy.spawn) / ratio;
    enemy.duration /= ratio;
    enemy.entryHold /= ratio;
    enemy.travelSpeed *= ratio;
  }
}
