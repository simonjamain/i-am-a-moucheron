// Test helper: plays the shooter's part for heavy weapons. Since heavy weapons
// are simulated by the player who fires them (src/heavy-sim.js), domain tests
// fly each recorded launch with the shared simulation, against the room's own
// state (the view the former server simulation used), and send the shooter's
// impact report. Assertions about trajectories and damage keep their meaning.
import { stepHeavy, heavyImpact } from '../src/heavy-sim.js';
import { swarmFrame } from '../src/waves.js';
import { airField } from '../src/air-current.js';

export function roomWorld(game, r) {
  const plan = game.plan(r),
    cache = new Map();
  return {
    solids: game.solids,
    roster: plan.roster,
    killed: (i) => r.kills.has(i),
    frames: (time, projectile) => {
      if (r.phase !== 'combat' || projectile.wave !== r.wave) return [];
      const at = Math.round(time / 50) * 50;
      if (!cache.has(at))
        cache.set(
          at,
          swarmFrame(
            plan.roster,
            (at - r.started) / 1000,
            r.groundAgents,
            airField(r.groundDefense, at),
          ),
        );
      return cache.get(at);
    },
    vehicles: [...r.vehicles.values()],
    players: [...r.pilots.values()]
      .filter((p) => p.life === 'alive' && !p.vehicle_id)
      .map((p) => ({ id: p.id, p: game.playerPosition(r, p) }))
      .filter((p) => p.p),
    equipment: r.equipment,
    guidance: (projectile) => {
      const owner = r.pilots.get(projectile.shooter);
      return owner?.life === 'alive' &&
        owner.vehicle_id === projectile.vehicle &&
        owner.seat === 'copilot' &&
        owner.occupation === projectile.occupation
        ? owner.state.turretDirection || [0, 0, -1]
        : null;
    },
    missileLost: (projectile) => {
      const v = r.vehicles.get(projectile.vehicle);
      return !v || v.state.hp <= 0;
    },
  };
}

// The shooter flies the launch itself: here the recorded object, so that tests
// can inspect it as they inspected the former server-side projectile.
// Advances every recorded launch of room `r` up to the game clock and reports
// its end, as each shooter's browser would: an impact, or a fizzle (inert
// contact, lifetime, lost helicopter). Returns the impact reports sent.
export function resolveHeavy(game, r, { now = game.now() } = {}) {
  const reports = [];
  for (const projectile of [...r.ordnance]) {
    if (projectile.done) continue;
    const impact = stepHeavy(projectile, now, roomWorld(game, r));
    if (impact) {
      const report = heavyImpact(
        projectile,
        impact.hit,
        impact.frames,
        impact.point,
        roomWorld(game, r),
      );
      reports.push(report);
      game.command(r.code, projectile.shooter, 'heavy-impact', report);
    } else if (projectile.done)
      game.command(r.code, projectile.shooter, 'heavy-impact', {
        shot: projectile.shot,
        fizzle: true,
      });
  }
  return reports;
}

// Detonation requested by the copilot: the missile explodes where it is.
export function detonateHeavy(game, r, shot, shooter) {
  const projectile = r.ordnance.find((s) => s.shot === shot);
  if (!projectile) return null;
  stepHeavy(projectile, game.now(), roomWorld(game, r));
  const world = roomWorld(game, r);
  const report = heavyImpact(
    projectile,
    {},
    world.frames(game.now(), projectile),
    projectile.p,
    world,
  );
  game.command(r.code, shooter ?? projectile.shooter, 'heavy-impact', report);
  return report;
}
