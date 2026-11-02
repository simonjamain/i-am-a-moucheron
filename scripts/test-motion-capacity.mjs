import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { GameSession } from '../server/session.js';
import { PROTOCOL } from '../src/udp-protocol.js';

const now = () => 100000;
for (const count of [2, 39, 40, 50]) {
  const game = new Game({ now });
  for (let i = 0; i < count; i++)
    game.join({ code: 'MOTION50', name: 'Pilot ' + i });
  const room = game.rooms.get('MOTION50');
  const player = [...room.pilots.values()][0];
  const vehicle = [...room.vehicles.values()][0];
  player.mode = 'flight';
  player.vehicle_id = vehicle.id;
  player.seat = 'pilot';
  vehicle.seats.set('pilot', player.id);
  let relays = 0;
  const session = new GameSession(game, {
    now,
    send: () => {},
    relay: () => relays++,
    close: () => {},
  });
  session.player = { code: room.code, id: player.id };
  for (let seq = 1; seq <= 20; seq++) {
    const state = { ...vehicle.state, vehicle: vehicle.id, seat: 'pilot', p: [seq / 100, 1, 0], fire: false };
    session.motion(
      JSON.stringify({
        v: PROTOCOL,
        seq,
        incarnation: player.incarnation,
        occupation: player.occupation,
        mode: player.mode,
        state,
      }),
    );
  }
  assert.equal(session.lastSeq, 20, 'every valid movement must still be accepted');
  assert.equal(vehicle.state.p[0], 0.2, 'the final movement must reach server physics');
  assert.equal(relays, count >= 40 ? 10 : 20, 'crowded rooms relay every other movement');
}
console.log('Motion relay: 2/39 players at 20 Hz, 40/50 players at 10 Hz; all 20 updates applied.');
