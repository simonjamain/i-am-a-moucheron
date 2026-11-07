import { PORTALS, portalExit } from './routes.js';
import { groundFlow, navigationStructures, previewStructures } from './ground-defense-state.js';

// A placement draft is local. Only the next authoritative snapshot changes
// the paths shown to the other players. The server walks the same smoothed
// flow-field route (ground-creatures.js), so an unchanged map shows the real path.
export function predictedGroundPaths({ groups, walls, command }) {
  let structures = navigationStructures(walls);
  if (command?.action === 'build') structures = [...structures, ...previewStructures(command)];
  else if (command?.action === 'remove')
    structures = structures.filter((wall) => wall.id !== command.id);
  const flow = groundFlow({ structures });
  return groups.map((group) => {
    const origin = portalExit(PORTALS.ground[group.portalIndex]);
    const points = flow.smoothRoute([origin[0], origin[2]])?.map(([x, z]) => [x, 0.003, z]);
    return { portalIndex: group.portalIndex, origin, points: points || [] };
  });
}
