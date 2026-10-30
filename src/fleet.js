import { MAP, ACTOR_UNIT } from './scale.js';
import { OFFICE_LAYOUT } from './layout.js';
export const VEHICLES = {
  fighter: {
    name: 'Chasseur M1',
    seats: ['pilot'],
    span: 10.4,
    length: 6.2,
    maxSpeed: 70,
    thrust: 12,
    drag: 0.0036,
    liftBase: 0.0032,
    turn: 1,
    gear: 1.05 * ACTOR_UNIT,
  },
  bomber: {
    name: 'Bombardier B3',
    seats: ['pilot', 'dorsal', 'tail'],
    span: 21,
    length: 14,
    maxSpeed: 52.5,
    thrust: 8,
    drag: 0.0045,
    liftBase: 0.0048,
    turn: 0.62,
    gear: 1.45 * ACTOR_UNIT,
  },
};
VEHICLES.interceptor = {
  ...VEHICLES.fighter,
  name: 'Stuka — attaque au sol',
  maxSpeed: 54,
  thrust: 9,
  drag: 0.0044,
  turn: 0.65,
  span: 14.2,
  length: 8.5,
};
VEHICLES.tank = {
  name: 'Tank T3',
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
};
VEHICLES.spitfire = {
  ...VEHICLES.fighter,
  name: 'Spitfire S6',
  maxSpeed: VEHICLES.fighter.maxSpeed * 1.75,
  thrust: 70,
  turn: VEHICLES.fighter.turn * 1.45,
  span: 11.2,
  length: 7,
};
VEHICLES.helicopter = {
  ...VEHICLES.fighter,
  name: 'Hélicoptère H2',
  seats: ['pilot', 'copilot'],
  span: 16,
  length: 14,
  maxSpeed: VEHICLES.fighter.maxSpeed * 0.6,
  gear: 1.1 * ACTOR_UNIT,
  helicopter: true,
  maxHP: 200,
};
VEHICLES.flaktruck = {
  name: 'DCA mobile D2',
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
};
export const SEAT_NAMES = {
  pilot: 'Pilote',
  copilot: 'Copilote armement',
  dorsal: 'Mitrailleur dorsal',
  tail: 'Mitrailleur de queue',
  cannon: 'Tireur principal',
  top: 'Mitrailleur supérieur',
};
export function vehiclePad(type) {
  const b = OFFICE_LAYOUT.base;
  return {
    p: [
      b.originX +
        (type === 'spitfire'
          ? 34
          : type === 'tank'
            ? -21
            : type === 'interceptor'
              ? 18
              : type === 'bomber'
                ? 5
                : -7) *
          ACTOR_UNIT,
      b.deckY + VEHICLES[type].gear,
      b.originZ - 5 * ACTOR_UNIT,
    ],
    q: [0, 1, 0, 0],
    v: [0, 0, 0],
    hp: VEHICLES[type].maxHP || 100,
    type,
    wing: 1,
    engine: 1,
    fire: false,
    landed: true,
  };
}
export function vehicleEntry(v, seat = 'pilot') {
  const p = v.state.p,
    q = v.state.q,
    s =
      (VEHICLES[v.type].span / 2 + 1.8) *
      (v.type === 'fighter' || seat === 'tail' || seat === 'top' ? -1 : 1),
    along =
      VEHICLES[v.type].seats.length < 2
        ? 0
        : seat === 'pilot'
          ? -4
          : seat === 'dorsal' || seat === 'cannon'
            ? 4
            : 0;
  const x = 1 - 2 * (q[1] * q[1] + q[2] * q[2]),
    z = 2 * (q[0] * q[2] - q[3] * q[1]);
  return {
    x: p[0] + (x * s + 2 * (q[0] * q[2] + q[3] * q[1]) * along) * MAP.ratio,
    y: p[1] - VEHICLES[v.type].gear,
    z: p[2] + (z * s + (1 - 2 * (q[0] * q[0] + q[1] * q[1])) * along) * MAP.ratio,
  };
}
export function vehicleAccess(body, v, seat = 'pilot') {
  if (!body || !v || body.parachute || v.state.hp <= 0) return false;
  const e = vehicleEntry(v, seat);
  return (
    Math.abs(body.y - e.y) < MAP.metres(2) && Math.hypot(body.x - e.x, body.z - e.z) < MAP.metres(3)
  );
}
export function leftVehiclePad(v) {
  const p = vehiclePad(v.type).p;
  return (
    Math.hypot(v.state.p[0] - p[0], v.state.p[2] - p[2]) >
      MAP.metres(VEHICLES[v.type].length + 3) || Math.abs(v.state.p[1] - p[1]) > MAP.metres(3)
  );
}
export function seatMount(type, seat) {
  if (type === 'helicopter') return seat === 'pilot' ? [0, 0.6, -2] : [0, 1.1, -0.8];
  if (type === 'flaktruck') return seat === 'cannon' ? [0, 1.8, 2.5] : [0, 1.5, -3.1];
  if (type === 'tank')
    return seat === 'cannon' ? [0, 1.3, 0] : seat === 'top' ? [0, 2.3, 1] : [0, 0.7, -1.5];
  if (type === 'bomber')
    return seat === 'tail' ? [0, 1, 5.5] : seat === 'dorsal' ? [0, 1.3, 0.1] : [0, 0.7, -3.6];
  return [0, 0.5, -0.5];
}
