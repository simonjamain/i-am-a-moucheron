import { canUseWeapon, heavyInterval, TANK_MG } from './armament.js';
import { HELI } from './helicopter.js';
import { pilotFireInterval } from './fleet.js';

export const heavyLane = (weapon) =>
  weapon === 'bomb' ? 'bomb' : weapon === 'missile' ? 'missile' : 'cannon';
export function heavyReadyAt(vehicle, weapon, fireRate = 1, predicted = 0) {
  return Math.max(
    predicted,
    weapon === 'missile'
      ? vehicle.nextMissileAt || 0
      : (vehicle.lastHeavy?.[heavyLane(weapon)] ?? -Infinity) +
          (heavyInterval(weapon, vehicle.type) * 1000) / fireRate,
  );
}
export function reloadProgress(now, readyAt, duration) {
  return duration > 0
    ? Math.max(0, Math.min(1, 1 - (readyAt - now) / duration))
    : now >= readyAt
      ? 1
      : 0;
}
// Public seat contract chooses arcs; HE/AP share a barrel and thus a single arc.
export function seatReloads({
  vehicle,
  seat,
  now,
  fireRate = 1,
  automaticCooldown = 0,
  predicted = () => 0,
  missileInFlight = false,
}) {
  if (!vehicle || vehicle.state.hp <= 0) return [];
  const arcs = [];
  const auto = vehicle.type === 'tank' && seat === 'cannon' ? 'coax' : seat;
  if (
    canUseWeapon(vehicle.type, seat, auto) &&
    !(vehicle.type === 'helicopter' && seat === 'pilot') &&
    vehicle.type !== 'flaktruck'
  ) {
    const interval =
      vehicle.type === 'helicopter'
        ? HELI.gunInterval
        : vehicle.type === 'tank'
          ? TANK_MG[auto]?.interval || 0.09
          : vehicle.type === 'castor'
            ? 0.16
            : seat === 'pilot'
              ? pilotFireInterval(vehicle.type)
              : 0.09;
    arcs.push({
      weapon: auto,
      progress: reloadProgress(0, automaticCooldown * 1000, (interval * 1000) / fireRate),
    });
  }
  for (const weapon of ['rocket', 'missile', 'bomb', 'he', 'proximity']) {
    if (!canUseWeapon(vehicle.type, seat, weapon)) continue;
    const duration =
      ((weapon === 'missile' ? 2 : heavyInterval(weapon, vehicle.type)) * 1000) / fireRate;
    arcs.push({
      weapon,
      progress:
        weapon === 'missile' && missileInFlight
          ? 0
          : reloadProgress(
              now,
              heavyReadyAt(vehicle, weapon, fireRate, predicted(weapon)),
              duration,
            ),
    });
  }
  return arcs;
}

export class ReloadHUD {
  constructor(root) {
    this.root = root;
    this.signature = '';
    this.circles = [];
  }
  update(arcs) {
    const signature = arcs.map((a) => a.weapon).join(':');
    if (signature === this.signature) {
      this.circles.forEach((circle, i) =>
        circle.setAttribute('stroke-dasharray', `${arcs[i].progress} 1`),
      );
      return;
    }
    this.signature = signature;
    this.circles = [];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-48 -48 96 96');
    svg.setAttribute('aria-label', 'Rechargement des armes');
    for (const [i, arc] of arcs.entries()) {
      const circle = document.createElementNS(ns, 'circle');
      const radius = 19 + i * 5;
      circle.setAttribute('r', radius);
      circle.setAttribute('pathLength', '1');
      circle.setAttribute('stroke-dasharray', `${arc.progress} 1`);
      circle.setAttribute('stroke', ['#d5ef73', '#f4cd81', '#a4e5f4'][i % 3]);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('transform', 'rotate(-90)');
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${arc.weapon} : ${Math.round(arc.progress * 100)} %`;
      circle.append(title);
      svg.append(circle);
      this.circles.push(circle);
    }
    this.root.replaceChildren(svg);
  }
}
