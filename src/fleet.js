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
  name: 'Chasseur M2',
  maxSpeed: 85,
  thrust: 16,
  drag: 0.0032,
};
export const SEAT_NAMES = {
  pilot: 'Pilote',
  dorsal: 'Mitrailleur dorsal',
  tail: 'Mitrailleur de queue',
};
export function vehiclePad(type) {
  const b = OFFICE_LAYOUT.base;
  return {
    p: [
      b.originX + (type === 'interceptor' ? 18 : type === 'bomber' ? 5 : -7) * ACTOR_UNIT,
      b.deckY + VEHICLES[type].gear,
      b.originZ - 5 * ACTOR_UNIT,
    ],
    q: [0, 1, 0, 0],
    v: [0, 0, 0],
    hp: 100,
    wing: 1,
    engine: 1,
    fire: false,
    landed: true,
  };
}
export function vehicleEntry(v) {
  const p = v.state.p,
    q = v.state.q,
    s = (VEHICLES[v.type].span / 2 + 1.2) * (v.type === 'fighter' ? -1 : 1);
  const x = 1 - 2 * (q[1] * q[1] + q[2] * q[2]),
    z = 2 * (q[0] * q[2] - q[3] * q[1]);
  return {
    x: p[0] + x * s * MAP.ratio,
    y: p[1] - VEHICLES[v.type].gear,
    z: p[2] + z * s * MAP.ratio,
  };
}
export function vehicleAccess(body, v) {
  if (!body || !v || body.parachute || v.state.hp <= 0) return false;
  const e = vehicleEntry(v);
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
  if (type === 'bomber')
    return seat === 'tail' ? [0, 1, 5.5] : seat === 'dorsal' ? [0, 1.3, 0.1] : [0, 0.7, -3.6];
  return [0, 0.5, -0.5];
}
