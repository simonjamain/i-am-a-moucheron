import { MAP, ACTOR_UNIT } from './scale.ts';
import { OFFICE_LAYOUT } from './layout.ts';
import type { FlightProfile } from './flight.ts';
import type { Vec3, Vec3Like, XYZ } from './types.ts';

/** Crew seats; display names in SEAT_NAMES. */
export type SeatName =
  | 'pilot'
  | 'copilot'
  | 'dorsal'
  | 'tail'
  | 'ventral'
  | 'cannon'
  | 'top'
  | 'passenger1'
  | 'passenger2'
  | 'passenger3';
/**
 * Static vehicle profile. Linear sizes in reference metres (span, length), gear
 * height in office metres (ACTOR_UNIT), flight fields as read by stepFlight.
 */
export interface VehicleProfile extends FlightProfile {
  name: string;
  seats: readonly SeatName[];
  span: number;
  length: number;
  maxSpeed: number;
  thrust: number;
  drag: number;
  liftBase: number;
  turn: number;
  gear: number;
  /** Rolls on the floor instead of flying. */
  ground?: boolean;
  /** Tractor + trailer (trailerAngle in motion). */
  articulated?: boolean;
  /** Rotorcraft flight model (collective, rotorPower). */
  helicopter?: boolean;
  /** Mobile support sphere: healing, resupply, repair. */
  support?: boolean;
  maxHP?: number;
  /** Multiplier of PILOT_FIRE_INTERVAL for the pilot's gun. */
  gunIntervalFactor?: number;
  /** Ground acceleration response (Castor progressive start). */
  response?: number;
  reverseSteering?: boolean;
}
// The original light fighter stays the reference the Stuka, the Spitfire and the
// H2 are derived from; the biplane fighter replaced it as the base fighter.
export const LIGHT_FIGHTER = {
  seats: ['pilot'] as SeatName[],
  span: 10.4,
  length: 6.2,
  maxSpeed: 70,
  thrust: 12,
  drag: 0.0036,
  liftBase: 0.0032,
  turn: 1,
  gear: 1.05 * ACTOR_UNIT,
};
export const VEHICLES = {
  // Biplane fighter: 25 % slower than the light fighter it replaced, but it keeps
  // control and lift at lower speed (later stall). One central machine gun that
  // fires like one gun of the light fighter: half its rate of fire.
  fighter: {
    ...LIGHT_FIGHTER,
    name: 'Chasseur biplan',
    length: 8.2,
    maxSpeed: LIGHT_FIGHTER.maxSpeed * 0.75,
    thrust: 7.4,
    liftBase: 0.0056,
    authoritySpeed: 8,
    stallAngle: 0.45,
    gunIntervalFactor: 2,
  },
  // Biplane bomber: pilot and one rear gunner, same flight characteristics as
  // the B3 it replaced; the bomb bay holds fewer bombs, dropped half as fast.
  bomber: {
    name: 'Bombardier biplan',
    seats: ['pilot', 'dorsal'],
    span: 21,
    length: 15.9,
    maxSpeed: 52.5,
    thrust: 8,
    drag: 0.0045,
    liftBase: 0.0048,
    turn: 0.62,
    gear: 1.45 * ACTOR_UNIT,
  },
  // The original aircraft stay in the game as purchases: the M1-style light
  // fighter and the four-seat medium bomber. Only the biplanes are free starters.
  lightfighter: { ...LIGHT_FIGHTER, name: 'Chasseur léger' },
  medbomber: {
    name: 'Bombardier moyen',
    seats: ['pilot', 'dorsal', 'tail', 'ventral'],
    span: 21,
    length: 14,
    maxSpeed: 52.5,
    thrust: 8,
    drag: 0.0045,
    liftBase: 0.0048,
    turn: 0.62,
    gear: 1.45 * ACTOR_UNIT,
  },
  interceptor: {
    ...LIGHT_FIGHTER,
    name: 'Stuka — attaque au sol',
    maxSpeed: 54,
    thrust: 9,
    drag: 0.0044,
    turn: 0.65,
    span: 14.2,
    length: 8.5,
  },
  tank: {
    name: 'Char moyen',
    seats: ['pilot', 'cannon', 'top'],
    span: 6,
    length: 8,
    maxSpeed: 12,
    thrust: 4,
    drag: 0.1,
    liftBase: 0,
    turn: 0.7,
    gear: 0.8 * ACTOR_UNIT,
    ground: true,
  },
  spitfire: {
    ...LIGHT_FIGHTER,
    name: 'Spitfire',
    maxSpeed: LIGHT_FIGHTER.maxSpeed * 1.75,
    thrust: 70,
    turn: LIGHT_FIGHTER.turn * 1.45,
    span: 11.2,
    length: 7,
  },
  helicopter: {
    ...LIGHT_FIGHTER,
    name: 'Hélicoptère d’attaque au sol',
    seats: ['pilot', 'copilot'],
    span: 16,
    length: 14,
    maxSpeed: LIGHT_FIGHTER.maxSpeed * 0.6,
    gear: 1.1 * ACTOR_UNIT,
    helicopter: true,
    maxHP: 200,
  },
  flaktruck: {
    name: 'Anti-air mobile',
    seats: ['pilot', 'cannon'],
    span: 5,
    length: 16,
    maxSpeed: 10,
    thrust: 3,
    drag: 0.1,
    liftBase: 0,
    turn: 0.45,
    gear: 0.8 * ACTOR_UNIT,
    ground: true,
    articulated: true,
  },
  // Fast single-seat construction and resupply truck; Meshy art follows later.
  castor: {
    name: 'Castor',
    seats: ['pilot'],
    span: 6,
    length: 9,
    // Same top speed, with a gentler progressive start (issue #171).
    maxSpeed: 52,
    response: 1.5,
    reverseSteering: true,
    thrust: 6,
    drag: 0.1,
    liftBase: 0,
    turn: 1.1,
    gear: 0.8 * ACTOR_UNIT,
    ground: true,
    support: true,
  },
  // Castor volant: tandem-rotor logistics helicopter. One pilot and three
  // passengers; any of them can drop every Castor construction except the LEGO
  // wall, straight below the helicopter (key V: vertical view). No weapon; same
  // mobile support sphere as the Castor (healing, resupply, barricade repair).
  flyingcastor: {
    ...LIGHT_FIGHTER,
    name: 'Castor volant',
    seats: ['pilot', 'passenger1', 'passenger2', 'passenger3'],
    span: 6,
    length: 13,
    maxSpeed: LIGHT_FIGHTER.maxSpeed * 0.6,
    gear: 1 * ACTOR_UNIT,
    helicopter: true,
    support: true,
    maxHP: 200,
  },
} satisfies Record<string, VehicleProfile>;

/** Every vehicle key; adding an entry to VEHICLES extends it (and every Record<VehicleType, …>). */
export type VehicleType = keyof typeof VEHICLES;
// Typed view for lookups by a runtime string (snapshots, commands).
const PROFILES: Readonly<Record<string, VehicleProfile | undefined>> = VEHICLES;

// Bombers: the pilot flies and drops bombs but has no machine gun.
export const isBomber = (type: string): boolean => type === 'bomber' || type === 'medbomber';
// Rotorcraft flight (H2 and Castor volant) and mobile support (both Castor).
export const isRotorcraft = (type: string): boolean => !!PROFILES[type]?.helicopter;
export const isSupportVehicle = (type: string): boolean => !!PROFILES[type]?.support;
export const isPassengerSeat = (seat: string | null | undefined): boolean =>
  /^passenger[1-3]$/.test(seat || '');
export const vehicleMaxHP = (type: string): number => PROFILES[type]?.maxHP || 100;

// Seconds between two pilot machine-gun rounds (0.06 s on the light fighters).
export const PILOT_FIRE_INTERVAL = 0.06;
export const pilotFireInterval = (type: string): number =>
  PILOT_FIRE_INTERVAL * (PROFILES[type]?.gunIntervalFactor ?? 1);

export const SEAT_NAMES: Readonly<Record<SeatName, string>> = {
  pilot: 'Pilote',
  copilot: 'Copilote armement',
  dorsal: 'Mitrailleur dorsal',
  tail: 'Mitrailleur de queue',
  ventral: 'Mitrailleur ventral',
  cannon: 'Tireur principal',
  top: 'Mitrailleur supérieur',
  passenger1: 'Passager',
  passenger2: 'Passager',
  passenger3: 'Passager',
};
// Parking spot of each vehicle along the deck, in actor units east of the base
// origin. Vehicles not listed share the default spot.
export const PAD_OFFSET: Readonly<Partial<Record<VehicleType, number>>> = {
  spitfire: 34,
  tank: -21,
  interceptor: 18,
  bomber: 5,
  medbomber: 11,
  lightfighter: -14,
};
const DEFAULT_PAD_OFFSET = -7;

/** Initial motion state of a parked vehicle (same shape as relayed motion). */
export interface VehicleMotionState {
  p: Vec3;
  q: [number, number, number, number];
  v: Vec3;
  hp: number;
  type: VehicleType;
  wing: number;
  engine: number;
  fire: boolean;
  landed: boolean;
}
export function vehiclePad(type: VehicleType): VehicleMotionState {
  const b = OFFICE_LAYOUT.base;
  const profile: VehicleProfile = VEHICLES[type];
  return {
    p: [
      b.originX + (PAD_OFFSET[type] ?? DEFAULT_PAD_OFFSET) * ACTOR_UNIT,
      b.deckY + profile.gear,
      b.originZ - 5 * ACTOR_UNIT,
    ],
    q: [0, 1, 0, 0],
    v: [0, 0, 0],
    hp: profile.maxHP || 100,
    type,
    wing: 1,
    engine: 1,
    fire: false,
    landed: true,
  };
}
/** The vehicle fields read by the boarding helpers (a room vehicle or snapshot entry). */
export interface VehicleRef {
  type: VehicleType;
  state: { p: Vec3Like; q: Vec3Like; hp: number };
}
interface BoardingBody {
  x: number;
  y: number;
  z: number;
  parachute?: boolean;
}

export function vehicleEntry(v: VehicleRef, seat: string = 'pilot'): XYZ {
  const profile: VehicleProfile = VEHICLES[v.type];
  const p = v.state.p,
    q = v.state.q,
    s =
      (profile.span / 2 + 1.8) *
      (v.type === 'fighter' ||
      v.type === 'lightfighter' ||
      seat === 'tail' ||
      seat === 'top' ||
      seat === 'ventral' ||
      seat === 'passenger3'
        ? -1
        : 1),
    along =
      profile.seats.length < 2
        ? 0
        : seat === 'ventral'
          ? -6
          : seat === 'pilot'
            ? -4
            : seat === 'passenger2'
              ? 4
              : seat === 'dorsal' || seat === 'cannon'
                ? 4
                : 0;
  const x = 1 - 2 * (q[1] * q[1] + q[2] * q[2]),
    z = 2 * (q[0] * q[2] - q[3] * q[1]);
  return {
    x: p[0] + (x * s + 2 * (q[0] * q[2] + q[3] * q[1]) * along) * MAP.ratio,
    y: p[1] - profile.gear,
    z: p[2] + (z * s + (1 - 2 * (q[0] * q[0] + q[1] * q[1])) * along) * MAP.ratio,
  };
}
export function vehicleAccess(
  body: BoardingBody | null | undefined,
  v: VehicleRef | null | undefined,
  seat: string = 'pilot',
): boolean {
  if (!body || !v || body.parachute || v.state.hp <= 0) return false;
  const e = vehicleEntry(v, seat);
  return (
    Math.abs(body.y - e.y) < MAP.metres(2) && Math.hypot(body.x - e.x, body.z - e.z) < MAP.metres(3)
  );
}
export function leftVehiclePad(v: VehicleRef): boolean {
  const p = vehiclePad(v.type).p;
  return (
    Math.hypot(v.state.p[0] - p[0], v.state.p[2] - p[2]) >
      MAP.metres(VEHICLES[v.type].length + 3) || Math.abs(v.state.p[1] - p[1]) > MAP.metres(3)
  );
}
