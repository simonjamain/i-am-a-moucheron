// Shared authoritative rules for fortifications unlocked by a team vote.
export const CASTOR_FORTIFICATIONS = Object.freeze({
  bunker: {
    name: 'Bunker LEGO', card: 'castorBunker', cost: 8, hp: 450,
    ammo: 200, interval: 0.17, damage: 25, range: 0.6, radius: 0.055,
    occupied: true, shell: false,
  },
  antitank: {
    name: 'Canon antichar', card: 'castorAntitank', cost: 12, hp: 250,
    ammo: 18, interval: 2, damage: 320, range: 1.1, radius: 0.047,
    occupied: true, shell: true,
  },
  autoturret: {
    name: 'Tourelle automatique', card: 'castorAutoturret', cost: 10, hp: 160,
    ammo: 300, interval: 0.3, damage: 35, range: 0.55, radius: 0.04,
    occupied: false, shell: false,
  },
});
function segmentDistance(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
      Math.max(1e-10, dx * dx + dz * dz)));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}
export function castorFortificationPlacement(kind, point, position, dollars, levels, equipment, structures) {
  const profile = CASTOR_FORTIFICATIONS[kind];
  if (!profile) throw Error('Défense de génie inconnue.');
  if (!levels?.[profile.card]) throw Error('Débloquez ce plan avec un vote entre les vagues.');
  if (
    !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
    Math.abs(point[0]) > 4.12 - profile.radius ||
    Math.abs(point[1]) > 3.51 - profile.radius
  ) throw Error('Emplacement de défense invalide.');
  if (
    !Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite) ||
    Math.hypot(point[0] - position[0], point[1] - position[1]) > 0.27
  ) throw Error('Le Castor doit rester près de la construction.');
  if (Math.hypot(point[0] - position[0], point[1] - position[1]) < 0.055)
    throw Error('Éloignez la construction du véhicule.');
  if ((equipment?.length || 0) >= 24) throw Error('Limite de 24 équipements atteinte.');
  if (
    (equipment || []).some((s) => Math.hypot(point[0] - s.x, point[1] - s.z) < profile.radius + 0.055) ||
    (structures || []).some((s) => s.kind === 'barricade' && s.hp > 0 &&
      segmentDistance(point, s.a, s.b) < profile.radius + 0.015)
  ) throw Error('Emplacement occupé par une autre défense.');
  if (!(Number.isFinite(dollars) && dollars >= profile.cost))
    throw Error('Caisse commune insuffisante.');
  return { price: profile.cost, profile };
}
export function fortificationProxy(s) {
  const p = CASTOR_FORTIFICATIONS[s.kind];
  if (!p || s.hp <= 0) return null;
  return {
    kind: 'barricade', id: 'fort:' + s.slot, hp: s.hp,
    a: [s.x - p.radius, s.z], b: [s.x + p.radius, s.z],
    thickness: p.radius * 2,
  };
}
