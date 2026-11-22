import { encodeMotionState } from '../src/motion-wire.ts';

// Traffic cost of the round counter and the reported ricochets in a motion state, relayed in
// binary to every player: the same firing fighter, without and with the new fields.
const base = {
  p: [0.12, 0.31, -0.4],
  q: [0.1, 0.2, 0.3, 0.9],
  v: [0.5, 0, -2],
  hp: 100,
  type: 'fighter',
  wing: 1,
  engine: 1,
  fire: true,
  vehicle: '3f2b8f0e-1b2c-4d5e-8f90-123456789abc',
  seat: 'pilot',
  landed: false,
  gas: 0.65,
  omega: [0, 0, 0],
  turret: -1,
  turretDirection: [0, 0.3, -1],
};
const size = (state) => encodeMotionState(state).length;
const json = (state) => JSON.stringify(state).length;
const skid = [1234, 1, 0.1, 0.2, 0.3, 1, 2, 3];
const rows = [
  ['before (no counter)', base],
  ['counter, firing', { ...base, rounds: 1234 }],
  ['counter + one ricochet', { ...base, rounds: 1234, skids: [skid] }],
  ['counter + eight ricochets', { ...base, rounds: 1234, skids: Array(8).fill(skid) }],
];
console.log('state                         binary relay (B)   upstream JSON (B)');
for (const [name, state] of rows)
  console.log(name.padEnd(30), String(size(state)).padStart(8), String(json(state)).padStart(18));
const extra = size(rows[1][1]) - size(base);
console.log(
  `\nCounter: +${extra} B per relayed state, i.e. +${extra * 20} B/s per player at 20 Hz.`,
);
console.log(
  `One round per message instead (100 rounds/s, ~16 B each): ~${100 * 16} B/s per shooter, ` +
    `${Math.round((100 * 16) / (extra * 20))}x more.`,
);
