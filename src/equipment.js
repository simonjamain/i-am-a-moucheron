import { MAP } from './scale.js';
export const SHOP = Object.freeze({
  refuel: {
    name: 'Station de ravitaillement',
    cost: 4,
    kind: 'placement',
    description: 'Plein gratuit en dix secondes, avion posé et arrêté.',
  },
  radar: {
    name: 'Radar',
    cost: 4,
    kind: 'placement',
    description: 'Révèle les ennemis dans une sphère de 1 m sur la carte.',
  },
  dca: {
    name: 'DCA à déployer',
    cost: 4,
    kind: 'placement',
    description: 'Un canon à poser sur une surface libre.',
  },
  interceptor: {
    name: 'Stuka d’attaque au sol',
    cost: 12,
    kind: 'vehicle',
    description: 'Un exemplaire avec 6 bombes ; remplacement payant après destruction.',
  },
  tank: {
    name: 'Tank T3',
    cost: 10,
    kind: 'vehicle',
    description: 'Un exemplaire, trois postes indépendants ; toutes munitions limitées.',
  },
  engine: {
    name: 'Motorisation',
    cost: 4,
    prices: [4, 9, 16],
    kind: 'upgrade',
    max: 3,
    description: '+10 % de poussée et +5 % de vitesse par niveau, pour tous.',
  },
  weapons: {
    name: 'Munitions renforcées',
    cost: 6,
    prices: [6, 12, 20],
    kind: 'upgrade',
    max: 3,
    description: '+75 dégâts des mitrailleuses par niveau ; pistolet inchangé.',
  },
});
export function shopPrice(key, upgrades = {}, installed = 0) {
  const item = SHOP[key];
  if (!item) return Infinity;
  if (['dca', 'refuel', 'radar'].includes(key))
    return key === 'dca'
      ? Math.min(40, item.cost + 2 * Math.max(0, installed))
      : item.cost + 2 * Math.max(0, installed);
  return item.prices?.[Math.min(item.prices.length - 1, upgrades[key] || 0)] ?? item.cost;
}
// A completed, non-lost wave pays this stipend immediately, independently of
// the slower Saint-Pierre queue. Each released NPC still yields one dollar.
export function waveStipend(wave) {
  return Math.min(20, 3 + Math.max(1, Math.floor(wave)));
}
export function upgradedVehicle(profile, upgrades = {}) {
  const n = Number(upgrades.engine) || 0;
  return {
    ...profile,
    thrust: profile.thrust * (1 + n * 0.1),
    maxSpeed: profile.maxSpeed * (1 + n * 0.05),
  };
}
export function placementAhead(body, distance = 5) {
  return {
    x: body.x + Math.sin(body.face) * MAP.metres(distance),
    y: body.y,
    z: body.z - Math.cos(body.face) * MAP.metres(distance),
  };
}
// The same footprint/support test runs in the browser and on generated office
// colliders in the Worker. Full base support, free headroom and nearby placement.
export function supportedPlacement(point, colliders, occupied = [], kind = 'dca') {
  const rx = kind === 'refuel' ? 0.065 : MAP.metres(2.1),
    rz = kind === 'refuel' ? 0.065 : MAP.metres(1.5),
    height = MAP.metres(3.2),
    eps = 1e-5;
  const surfaces = colliders
    .filter(
      (box) =>
        point.x - rx >= box.min.x &&
        point.x + rx <= box.max.x &&
        point.z - rz >= box.min.z &&
        point.z + rz <= box.max.z &&
        box.max.y <= point.y + MAP.metres(2) &&
        box.max.y >= point.y - MAP.metres(6),
    )
    .sort((a, b) => b.max.y - a.max.y);
  for (const surface of surfaces) {
    const y = surface.max.y;
    const blocked = colliders.some(
      (box) =>
        box !== surface &&
        box.max.y > y + eps &&
        box.min.y < y + height &&
        box.max.x > point.x - rx &&
        box.min.x < point.x + rx &&
        box.max.z > point.z - rz &&
        box.min.z < point.z + rz,
    );
    if (
      blocked ||
      occupied.some(
        (s) =>
          Math.abs(s.y - y) < height &&
          Math.hypot(s.x - point.x, s.z - point.z) <
            (s.clearance
              ? s.clearance + rx
              : kind === 'refuel' || s.kind === 'refuel'
                ? 0.08
                : MAP.metres(5)),
      )
    )
      continue;
    return { x: point.x, y: y + 0.00005, z: point.z };
  }
  return null;
}
