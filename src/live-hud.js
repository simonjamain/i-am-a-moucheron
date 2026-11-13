import { MAP } from './scale.js';
import { formatDistance } from './units.js';
import { VEHICLES, vehicleMaxHP } from './fleet.js';

// Single source of the bottom-left command help. Each context lists only the inputs
// that client.js really routes for the current role, seat, station or tool.
const AIR_EXIT = 'F : sauter / sortir · Espace en chute : parachute';
const GROUND_EXIT = 'F : sortir';
const BUILD = 'G / clic molette : construire';
const LINE_TOOLS = ['barricade', 'sticky'];
const ORIENTED_TOOLS = ['sugar', 'fan'];
const STATIONS = {
  dca: ['Clic / Espace : obus', 'Maj/Ctrl, [ ] ou molette : fusée'],
  bunker: ['Clic / Espace : balles'],
  antitank: ['Clic / Espace : obus anti-matériel'],
};

function postsHint(type) {
  const count = VEHICLES[type]?.seats.length || 1;
  return count > 1 ? '1–' + count + ' : postes (contrats)' : null;
}

function buildingHints({ mode = 'barricade', castor = false, anchored = false, air = false }) {
  // Castor volant: drops straight below, turned like the helicopter.
  if (air)
    return [
      'V : vue verticale · A/E : tourner',
      'Clic / Entrée : ' +
        (mode === 'repair' ? 'réparer' : mode === 'remove' ? 'enlever' : 'larguer'),
      "G / clic molette : changer d'outil",
      'Échap : quitter',
    ];
  const move = castor ? 'Z/S/Q/D : conduire' : 'ZQSD / flèches : marcher';
  const line = LINE_TOOLS.includes(mode);
  const verb =
    mode === 'repair' ? 'réparer' : mode === 'remove' ? 'enlever' : line ? null : 'poser';
  return [
    move,
    'Souris : viser',
    line
      ? castor
        ? 'Clic / E : ' + (anchored ? 'arrêter' : 'démarrer') + ' la dépose (1 $ / 20 cm)'
        : 'Clic / E : ' + (anchored ? 'poser la fin' : 'fixer le début')
      : 'Clic / E : ' + verb,
    ORIENTED_TOOLS.includes(mode) && 'R : orienter',
    "G / clic molette : changer d'outil",
    'Échap : quitter',
  ];
}

function vehicleHints({ type, supplies }, seat, build) {
  if (type === 'castor')
    return [
      'Z/S : avancer/reculer',
      'Q/D : tourner',
      'Souris : viser',
      'Clic : mitrailleuse',
      build && BUILD,
      'V : vue de dessus',
      'Clic droit : zoom',
      GROUND_EXIT,
    ];
  if (type === 'flyingcastor')
    return [
      ...(seat === 'pilot'
        ? [
            'Souris : incliner',
            'Z/S/Q/D : tangage et roulis',
            'Maj : monter',
            'Ctrl : descendre',
            'V : vue verticale (A/E : tourner)',
          ]
        : ['Souris : regarder', 'V : vue verticale']),
      build && 'G / clic molette : larguer',
      'Clic droit : zoom',
      postsHint(type),
      AIR_EXIT,
    ];
  if (type === 'helicopter')
    return [
      ...(seat === 'pilot'
        ? [
            'Souris : incliner',
            'Q/D/Gauche/Droite : roulis',
            'Z/S/Haut/Bas : tangage',
            'Maj : monter',
            'Ctrl : descendre',
            'Relâcher : stationnaire',
            'C : vue libre',
            'Clic : roquettes',
          ]
        : ['Souris : viser', 'Maj : MG', 'Ctrl : missile', 'Clic : tir / détonation']),
      'Clic droit : zoom',
      postsHint(type),
      AIR_EXIT,
    ];
  if (type === 'flaktruck')
    return [
      ...(seat === 'pilot'
        ? ['Z/S : avancer/reculer', 'Q/D : tourner']
        : ['Souris : canon', 'Clic : obus', 'Molette : proximité 0,5–20 m']),
      'Clic droit : zoom',
      postsHint(type),
      GROUND_EXIT,
    ];
  if (type === 'tank')
    return [
      ...(seat === 'pilot'
        ? ['Z/S : avancer/reculer', 'Q/D : tourner', 'Clic : MG']
        : seat === 'cannon'
          ? [
              'Souris : tourelle',
              'Clic : canon',
              'Espace : coaxiale',
              'Maj HE / Ctrl AP',
              'C : observer',
            ]
          : ['Souris : tourelle', 'Clic / Espace : MG']),
      'Clic droit : zoom',
      postsHint(type),
      GROUND_EXIT,
    ];
  return [
    ...(seat === 'pilot'
      ? [
          'Souris : cap',
          'Z/S : tangage',
          'Q/D : roulis',
          'A/E : gouverne',
          'Maj/Ctrl ou molette : gaz',
          'C : regard libre',
          type !== 'bomber' && 'Clic : MG',
          supplies?.ammo?.bomb !== undefined && 'Espace : bombes',
        ]
      : ['Souris : tourelle', 'Clic / Espace : MG']),
    'Clic droit : zoom',
    postsHint(type),
    AIR_EXIT,
  ];
}

export function controlHintItems({
  vehicle,
  seat,
  dead = false,
  turret = false,
  station = turret ? 'dca' : null,
  airborne = false,
  placing = false,
  observing = false,
  build = false,
  wheel = false,
  building = null,
} = {}) {
  if (observing) return ['Observation · Accéder au purgatoire avec le bouton'];
  if (wheel)
    return ['Souris : choisir un outil', 'Relâcher G / clic molette : valider', 'Échap : annuler'];
  if (building) return buildingHints(building);
  if (placing)
    return ['ZQSD / flèches : marcher', 'Souris : orienter', 'E : poser', 'Échap : conserver'];
  const common = ['N : banque', 'Échap : curseur'];
  let items;
  if (station)
    items = [
      'Souris : viser',
      ...(STATIONS[station] || STATIONS.dca),
      'Clic droit : zoom',
      GROUND_EXIT,
    ];
  else if (vehicle) items = vehicleHints(vehicle, seat, build);
  else if (dead)
    items = [
      'ZQSD / flèches : marcher',
      'Molette : zoom',
      'Clic : pistolet',
      'Espace : jet',
      'E : formulaires',
    ];
  else if (airborne) items = ['ZQSD / flèches : diriger', 'Espace : parachute', 'Molette : zoom'];
  else
    items = [
      'ZQSD / flèches : marcher',
      'Molette : zoom',
      'Espace : jet',
      'E : interagir',
      'P : achats',
      build && BUILD,
    ];
  return [...items, ...common].filter(Boolean);
}

export function controlHints(context = {}) {
  return controlHintItems(context).join(' · ');
}
export function cursorStats({ vehicle, seat, hp, speed, ammo }) {
  if (!vehicle) return null;
  const bombs = seat === 'pilot' ? vehicle.supplies?.ammo.bomb : undefined;
  return {
    speed: Math.max(0, speed),
    hp: Math.max(0, Math.min(vehicleMaxHP(vehicle.type), hp)),
    ammo: Math.max(0, Math.floor(ammo || 0)),
    bombs: bombs === undefined ? null : Math.floor(bombs),
  };
}

export function cursorAmmoText({ vehicle, seat, ammo, proximity = 5, guiding = false }) {
  const count = (value) => Math.max(0, Math.floor(value || 0));
  const stock = vehicle.supplies?.ammo || {};
  const fuel = ''; // Dedicated percentage gauge beside the crosshair.
  if (vehicle.type === 'flyingcastor') return seat === 'pilot' ? 'Pilote' : 'Passager';
  if (vehicle.type === 'helicopter')
    return (
      (seat === 'pilot'
        ? count(stock.rocket) + ' roquettes'
        : count(stock.copilot) +
          ' balles · ' +
          count(stock.missile) +
          ' missiles' +
          (guiding ? ' · GUIDAGE' : '')) + fuel
    );
  if (vehicle.type === 'flaktruck')
    return (
      (seat === 'cannon'
        ? count(stock.proximity) + ' obus · ' + formatDistance(MAP.metres(proximity))
        : 'Conducteur') + fuel
    );
  return (
    count(ammo) +
    ' balles' +
    (seat === 'pilot' && stock.bomb !== undefined ? ' · ' + count(stock.bomb) + ' bombes' : '')
  );
}
