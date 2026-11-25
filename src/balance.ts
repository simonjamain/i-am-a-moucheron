import { assignMidgeSwarmSizes } from './waves.ts';
import type { WaveEnemy } from './waves.ts';

/** One tunable room setting: its form label, validation grid and default value. */
export interface BalanceField {
  label: string;
  min: number;
  step: number;
  value: number;
  when: string;
}

// Room-local settings. No mutable module-level gameplay configuration.
export const BALANCE_FIELDS = Object.freeze({
  population: {
    label: 'Quantité d’ennemis',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochaine vague encore à tirer',
  },
  progression: {
    label: 'Progression de la difficulté',
    min: 0.25,
    step: 0.25,
    value: 1,
    when: 'Prochaine vague encore à tirer, déblocages compris',
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
  waveGrowth: {
    label: 'Multiplicateur de vague (g)',
    min: 1,
    step: 0.05,
    value: 1.5,
    when: 'Prochaine vague encore à tirer',
  },
  firstWavePower: {
    label: 'Puissance de la première vague',
    min: 1,
    step: 1,
    value: 32,
    when: 'Prochaine vague encore à tirer',
  },
  playerExponent: {
    label: 'Exposant du nombre de joueurs',
    min: 0,
    step: 0.05,
    value: 0.9,
    when: 'Prochaine vague encore à tirer',
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
    when: 'Prochain tir',
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
    value: 60,
    when: 'Compte à rebours initial, préavis minimum de 5 secondes',
  },
  pause: {
    label: 'Pause entre vagues (secondes)',
    min: 5,
    step: 1,
    value: 180,
    when: 'Pause en cours, préavis minimum de 5 secondes',
  },
} satisfies Record<string, BalanceField>);
export type BalanceKey = keyof typeof BALANCE_FIELDS;
/** A room's full settings, one number per field (`room.balance`). */
export type Balance = Record<BalanceKey, number>;
export const DEFAULT_BALANCE: Readonly<Balance> = Object.freeze(
  Object.fromEntries(Object.entries(BALANCE_FIELDS).map(([key, field]) => [key, field.value])),
) as Readonly<Balance>;
export function validateBalance(patch: unknown): Partial<Balance> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw Error('Réglages invalides.');
  for (const [key, value] of Object.entries(patch)) {
    const field: BalanceField | false =
      Object.hasOwn(BALANCE_FIELDS, key) && BALANCE_FIELDS[key as BalanceKey];
    if (
      !field ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < field.min ||
      Math.abs((value - field.min) / field.step - Math.round((value - field.min) / field.step)) >
        1e-7
    )
      throw Error('Réglage invalide : ' + key);
  }
  return patch as Partial<Balance>;
}
export const money = (value: number, factor = 1): number => Math.round(value * factor * 100) / 100;
export function scaleRoster<E extends WaveEnemy>(
  plan: { budget: number; roster: readonly E[] },
  balance: Pick<Balance, 'population' | 'enemyHP' | 'enemySpeed'>,
): { budget: number; roster: E[] } {
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
export function retimeRoster(roster: readonly WaveEnemy[], time: number, ratio: number): void {
  for (const enemy of roster) {
    // Scale the entire age and duration together, preserving route progress and entry hold.
    if (time >= enemy.spawn) enemy.spawn = time - (time - enemy.spawn) / ratio;
    enemy.duration /= ratio;
    enemy.entryHold /= ratio;
    enemy.travelSpeed *= ratio;
  }
}
