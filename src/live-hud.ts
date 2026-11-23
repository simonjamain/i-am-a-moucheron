import { MAP } from './scale.ts';
import { formatDistance } from './units.ts';
import { VEHICLES, vehicleMaxHP, isBomber } from './fleet.ts';
import type { VehicleType } from './fleet.ts';

/** Ammunition stocks read by the HUD (absent kinds are not carried). */
export interface HudAmmo {
  bomb?: number;
  rocket?: number;
  copilot?: number;
  missile?: number;
  proximity?: number;
}
/** The vehicle fields read by the HUD (a room vehicle or snapshot entry). */
export interface HudVehicle {
  type: string;
  supplies?: { ammo: HudAmmo } | null;
}
export interface BuildingHintContext {
  mode?: string;
  castor?: boolean;
  anchored?: boolean;
  air?: boolean;
}
export interface ControlHintContext {
  vehicle?: HudVehicle | null;
  seat?: string | null;
  dead?: boolean;
  turret?: boolean;
  station?: string | null;
  airborne?: boolean;
  placing?: boolean;
  observing?: boolean;
  /** In Saint Pierre's sky: no bank, workshop nor construction. */
  heaven?: boolean;
  build?: boolean;
  wheel?: boolean;
  building?: BuildingHintContext | null;
}
type HintItem = string | false | null;

// Single source of the bottom-left command help. Each context lists only the inputs
// that client.js really routes for the current role, seat, station or tool.
const AIR_EXIT = 'F : sauter / sortir · Espace en chute : parachute';
const GROUND_EXIT = 'F : sortir';
const BUILD = 'G / clic molette : construire';
const LINE_TOOLS = ['barricade', 'sticky'];
const ORIENTED_TOOLS = ['sugar'];
const STATIONS: Readonly<Record<string, readonly string[]>> = {
  dca: ['Clic : obus', 'Maj/Ctrl, [ ] ou molette : fusée'],
  dcaRapid: ['Clic : balles'],
  dcaHeavy: ['Clic : obus', 'Molette : proximité'],
  antitank: ['Clic : obus anti-matériel'],
};

function postsHint(type: string): string | null {
  const count = VEHICLES[type as VehicleType]?.seats.length || 1;
  return count > 1 ? '1–' + count + ' : postes (contrats)' : null;
}

function buildingHints({
  mode = 'barricade',
  castor = false,
  anchored = false,
  air = false,
}: BuildingHintContext): HintItem[] {
  // Castor volant: drops straight below, turned like the helicopter.
  if (air)
    return [
      'V : vue verticale · A/E : tourner',
      'Clic : ' + (mode === 'repair' ? 'réparer' : mode === 'remove' ? 'enlever' : 'larguer'),
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
        ? 'Clic : ' + (anchored ? 'arrêter' : 'démarrer') + ' la dépose (1 $ / 20 cm)'
        : 'Clic : ' + (anchored ? 'poser la fin' : 'fixer le début')
      : 'Clic : ' + verb,
    ORIENTED_TOOLS.includes(mode) && 'R : orienter',
    "G / clic molette : changer d'outil",
    'Échap : quitter',
  ];
}

function vehicleHints(
  { type, supplies }: HudVehicle,
  seat: string | null | undefined,
  build: boolean,
): HintItem[] {
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
        : ['Souris : viser', 'Clic : mitrailleuse', 'Espace : missile guidé / détonation']),
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
        ? ['Z/S : avancer/reculer', 'Q/D : tourner', 'Souris : viser (±15°)', 'Clic : MG']
        : seat === 'cannon'
          ? [
              'Souris : tourelle',
              'Clic : canon',
              'Espace : coaxiale',
              'R : obus HE / AP',
              'C : observer',
            ]
          : ['Souris : tourelle', 'Clic : MG']),
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
          !isBomber(type) && 'Clic : MG',
          supplies?.ammo?.bomb !== undefined && 'Espace : bombes',
        ]
      : ['Souris : tourelle', 'Clic : MG']),
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
  heaven = false,
  build = false,
  wheel = false,
  building = null,
}: ControlHintContext = {}): HintItem[] {
  if (observing) return ['Votre âme monte au ciel…'];
  if (wheel)
    return ['Souris : choisir un outil', 'Relâcher G / clic molette : valider', 'Échap : annuler'];
  if (building) return buildingHints(building).filter(Boolean);
  if (placing)
    return [
      'ZQSD / flèches : marcher',
      'Souris : orienter',
      'Clic gauche : poser',
      'Clic droit / Échap : conserver',
    ];
  const common = heaven
    ? ['Tab : vague', 'Échap : curseur']
    : ['Tab : vague', 'N : banque', 'Échap : curseur'];
  build = build && !heaven;
  let items: HintItem[];
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
      'Espace : sauter',
      'Clic sur le porte-bloc : formulaires',
    ];
  else if (airborne) items = ['ZQSD / flèches : diriger', 'Espace : parachute', 'Molette : zoom'];
  else
    items = [
      'ZQSD / flèches : marcher',
      'Molette : zoom',
      'Espace : sauter',
      'Clic : utiliser ce qui est entouré',
      'P : achats',
      build && BUILD,
    ];
  return [...items, ...common].filter(Boolean);
}

export function controlHints(context: ControlHintContext = {}): string {
  return controlHintItems(context).join(' · ');
}
export interface CursorStatsInput {
  vehicle: HudVehicle | null | undefined;
  seat: string | null | undefined;
  hp: number;
  speed: number;
  ammo?: number | null;
}
export interface CursorStats {
  speed: number;
  hp: number;
  ammo: number;
  bombs: number | null;
}
export function cursorStats({
  vehicle,
  seat,
  hp,
  speed,
  ammo,
}: CursorStatsInput): CursorStats | null {
  if (!vehicle) return null;
  const bombs = seat === 'pilot' ? vehicle.supplies?.ammo.bomb : undefined;
  return {
    speed: Math.max(0, speed),
    hp: Math.max(0, Math.min(vehicleMaxHP(vehicle.type), hp)),
    ammo: Math.max(0, Math.floor(ammo || 0)),
    bombs: bombs === undefined ? null : Math.floor(bombs),
  };
}

export interface CursorAmmoInput {
  vehicle: HudVehicle;
  seat: string | null | undefined;
  ammo?: number | null;
  proximity?: number;
  guiding?: boolean;
}
export function cursorAmmoText({
  vehicle,
  seat,
  ammo,
  proximity = 5,
  guiding = false,
}: CursorAmmoInput): string {
  const count = (value: number | null | undefined): number => Math.max(0, Math.floor(value || 0));
  const stock: HudAmmo = vehicle.supplies?.ammo || {};
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
