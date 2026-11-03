import { enemyRoute, PORTALS, portalExit } from './routes.js';
import { groundFlow } from './ground-defense-state.js';
import { splitBarricade } from './ground-defense.js';

// A placement draft is local. Only the next authoritative snapshot changes
// the paths shown to the other players.
export function predictedGroundPaths({ groups, walls, active, command }) {
  if (command?.action === 'build' && command.kind === 'barricade') {
    walls = [
      ...walls,
      ...splitBarricade(command.a, command.b, 'preview').map((piece) => ({
        ...piece,
        kind: 'barricade',
        hp: 100,
      })),
    ];
  } else if (command?.action === 'remove') {
    walls = walls.filter((wall) => wall.id !== command.id);
  }
  const flow =
    active || (command?.action === 'build' && command.kind !== 'fan')
      ? groundFlow({ structures: walls })
      : null;
  return groups.map((group) => {
    const origin = portalExit(PORTALS.ground[group.portalIndex]);
    const points = flow
      ? flow.route([origin[0], origin[2]])?.map(([x, z]) => [x, 0.003, z])
      : enemyRoute(group).points.map(([x, y, z]) => [x, y + 0.002, z]);
    return { portalIndex: group.portalIndex, origin, points: points || [] };
  });
}
