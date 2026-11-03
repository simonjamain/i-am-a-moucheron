import { FAN_COST, FAN_FADE_MS } from './air-current.js';
import { ROUTE_OBSTACLES } from './route-obstacles.js';
import {
  splitBarricade,
  buildGroundFlow,
  distanceToSegment,
  STICKY_WIDTH,
} from './ground-defense.js';

export const GROUND_BOUNDS = Object.freeze([-4.12, -3.51, 4.12, 3.51]);
export const GROUND_GOAL = Object.freeze([3, -2.7]);
export const GROUND_CELL = 0.05;
export const GROUND_LIMIT = 512;
export const GROUND_BAIT_TYPES = Object.freeze({
  sugar: { radius: 0.15, cost: 3, mealSeconds: 4 },
});
export const GROUND_WALL_HP = 100;
export const GROUND_WALL_COST_PER_SEGMENT = 1;
export const GROUND_STICKY_COST_PER_20CM = 1;

export function feedingPoint(bait) {
  const angle = bait.angle || 0;
  return [bait.position[0] + Math.sin(angle) * 0.024, bait.position[1] + Math.cos(angle) * 0.024];
}
export function newGroundDefense() {
  return { revision: 0, navigationRevision: 0, nextId: 0, structures: [], retiringFans: [] };
}
function finitePoint(p) {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(Number.isFinite) &&
    p[0] >= GROUND_BOUNDS[0] &&
    p[0] <= GROUND_BOUNDS[2] &&
    p[1] >= GROUND_BOUNDS[1] &&
    p[1] <= GROUND_BOUNDS[3]
  );
}
function length(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function nearFoot(point, foot) {
  return (
    Number.isFinite(foot?.[0]) &&
    Number.isFinite(foot?.[1]) &&
    Math.hypot(point[0] - foot[0], point[1] - foot[1]) <= 0.27
  );
}
function fail(message) {
  throw new Error(message);
}
export function groundSnapshot(state, now = Date.now()) {
  state.retiringFans = (state.retiringFans || []).filter((f) => now < f.removedAt + FAN_FADE_MS);
  return {
    revision: state.revision,
    navigationRevision: state.navigationRevision,
    structures: structuredClone(state.structures),
    ...(state.retiringFans.length ? { retiringFans: structuredClone(state.retiringFans) } : {}),
  };
}
export function groundFlow(state, goal = GROUND_GOAL) {
  return buildGroundFlow({
    bounds: GROUND_BOUNDS,
    cellSize: GROUND_CELL,
    goal,
    barricades: state.structures.filter((s) => s.kind === 'barricade' && s.hp > 0),
    staticObstacles: ROUTE_OBSTACLES.filter(
      (box) =>
        box.min.y < 0.01 &&
        box.max.y > 0.01 &&
        box.max.x - box.min.x < 2 &&
        box.max.z - box.min.z < 2,
    ),
  });
}
// One synchronous command is an atomic room transaction. Never accept costs, HP,
// owners, revision numbers or placement identities from network clients.
export function groundCommand(state, command, foot, dollars, now = Date.now()) {
  if (!state || !command || typeof command !== 'object' || !Number.isFinite(dollars))
    fail('Commande de défense invalide.');
  const action = command.action;
  if (action === 'build') {
    const { kind, a, b } = command;
    const pointItem = kind === 'sugar' || kind === 'fan';
    if (
      !['barricade', 'sticky', 'sugar', 'fan'].includes(kind) ||
      !finitePoint(a) ||
      (!pointItem && !finitePoint(b))
    )
      fail('Emplacement de construction invalide.');
    if (!nearFoot(a, foot)) fail('Construisez à proximité de votre personnage.');
    const distance = pointItem ? 0 : length(a, b);
    if (!pointItem && distance < 0.002) fail('Tracez la construction depuis votre position.');
    const count = kind === 'barricade' ? Math.ceil(distance / 0.2) : 1;
    if (state.structures.length + count > GROUND_LIMIT)
      fail('Trop de constructions dans la salle.');
    const price =
      kind === 'fan'
        ? FAN_COST
        : kind === 'sugar'
          ? GROUND_BAIT_TYPES.sugar.cost
          : kind === 'barricade'
            ? count * GROUND_WALL_COST_PER_SEGMENT
            : Math.ceil(distance / 0.2) * GROUND_STICKY_COST_PER_20CM;
    if (dollars + 1e-8 < price) fail('Caisse commune insuffisante.');
    const id = String(state.nextId + 1);
    const items =
      kind === 'barricade'
        ? splitBarricade(a, b, id).map((piece) => ({
            ...piece,
            kind,
            hp: GROUND_WALL_HP,
            maxHp: GROUND_WALL_HP,
          }))
        : kind === 'sticky'
          ? [{ id, kind, a: [...a], b: [...b], width: STICKY_WIDTH }]
          : [
              {
                id,
                kind,
                position: [...a],
                angle: Number.isFinite(command.angle) ? command.angle % (2 * Math.PI) : 0,
                ...(kind === 'fan'
                  ? { placedAt: now }
                  : { type: 'sugar', radius: GROUND_BAIT_TYPES.sugar.radius }),
              },
            ];
    if (kind === 'sugar' && !finitePoint(feedingPoint(items[0])))
      fail('Les cristaux dépassent du bureau.');
    // Validate collisions with existing barricades, preserving adjacent segments
    // of the same stroke; bail out before spending anything.
    for (const item of items) {
      const sample = item.position
        ? item.position
        : [(item.a[0] + item.b[0]) / 2, (item.a[1] + item.b[1]) / 2];
      if (
        state.structures.some((existing) => {
          if (existing.kind !== 'barricade' || existing.hp <= 0) return false;
          return distanceToSegment(sample, existing.a, existing.b) < 0.02;
        })
      )
        fail('Emplacement déjà occupé par une barricade.');
    }
    state.nextId++;
    state.structures.push(...items);
    state.revision++;
    if (kind === 'barricade') state.navigationRevision++;
    return { price, ids: items.map((item) => item.id) };
  }
  if (!['repair', 'remove'].includes(action)) fail('Action de défense inconnue.');
  if (typeof command.id !== 'string') fail('Identifiant de construction invalide.');
  const index = state.structures.findIndex((s) => s.id === command.id);
  if (index < 0) fail('Construction introuvable.');
  const item = state.structures[index];
  const position = item.position || [(item.a[0] + item.b[0]) / 2, (item.a[1] + item.b[1]) / 2];
  if (!nearFoot(position, foot)) fail('Approchez-vous de la construction.');
  if (action === 'repair') {
    if (item.kind !== 'barricade' || item.hp <= 0 || item.hp >= item.maxHp)
      fail('Ce segment ne peut pas être réparé.');
    if (dollars < 1) fail('Caisse commune insuffisante.');
    item.hp = item.maxHp;
    state.revision++;
    return { price: 1, ids: [item.id] };
  }
  if (item.kind === 'fan') {
    state.retiringFans = (state.retiringFans || []).filter((f) => now < f.removedAt + FAN_FADE_MS);
    state.retiringFans.push({ ...item, removedAt: now });
  }
  state.structures.splice(index, 1);
  state.revision++;
  if (item.kind === 'barricade') state.navigationRevision++;
  return { price: 0, ids: [item.id] };
}
// Invoked by authoritative server combat only; never expose as a network command.
export function damageBarricade(state, id, damage) {
  if (!Number.isFinite(damage) || damage <= 0) fail('Dégâts invalides.');
  const item = state.structures.find((s) => s.id === id && s.kind === 'barricade');
  if (!item || item.hp <= 0) return false;
  item.hp = Math.max(0, item.hp - damage);
  state.revision++;
  if (item.hp === 0) state.navigationRevision++;
  return item.hp === 0;
}
