import { WALL_SEGMENT, WALL_SEGMENT_PRICE, HALF_BRICK, wallLength } from './brick-rules.ts';
import { SENTRY, isTurret, turretSpec, upgradesOf, upgradeCost } from './ground-sentry.ts';
import type { TurretKind } from './ground-sentry.ts';
import { FORTIFICATIONS, isFortification } from './ground-fortifications.ts';
import { onFloor, levelOf, FLOOR_LEVEL } from './airdrop.ts';
import {
  splitBarricade,
  buildGroundFlow,
  distanceToSegment,
  STICKY_WIDTH,
  GROUND_BOUNDS,
  groundGoal,
  GROUND_CELL,
  groundStaticObstacles,
} from './ground-defense.ts';
import type { GroundPoint } from './ground-defense.ts';
export { GROUND_BOUNDS, groundGoal, GROUND_CELL };

/**
 * One ground construction as stored in the room (wall piece, tape, sugar, turret,
 * fortification). Fields depend on the kind; the server adds equipment fields
 * (`slot`, `x`, `z`, `name`) to fortifications.
 */
export interface GroundStructure {
  id: string;
  kind: string;
  /** Segment ends [x, z] (barricade, sticky). */
  a?: number[];
  b?: number[];
  /** Point items [x, z] (sugar, turrets, fortifications). */
  position?: number[];
  angle?: number;
  hp?: number;
  maxHp?: number;
  ammo?: number;
  width?: number;
  type?: string;
  radius?: number;
  /** Height above the floor (built on furniture); absent on the floor. */
  y?: number;
  lastShotAt?: number;
  aimTarget?: number[];
  slot?: number;
  x?: number;
  z?: number;
  name?: string;
}
/** A Castor volant construction still falling (server-owned). */
export interface GroundDrop {
  id: string;
  kind: string;
  command: GroundCommand;
  price?: number;
  x: number;
  z: number;
  angle?: number;
  fromY: number;
  landingY: number;
  startedAt: number;
  at?: number;
}
export interface GroundDefenseState {
  revision: number;
  navigationRevision: number;
  nextId: number;
  structures: GroundStructure[];
  drops?: GroundDrop[];
  dropSeq: number;
}
/** A defense order as received from a client: every field is checked here. */
export interface GroundCommand {
  action?: unknown;
  kind?: unknown;
  a?: unknown;
  b?: unknown;
  angle?: unknown;
  id?: unknown;
  variant?: unknown;
}
/** Who orders the build: from the Castor, and at which surface height. */
export interface GroundAccess {
  castor?: boolean;
  y?: number;
}
export interface GroundTransaction {
  price: number;
  ids: string[];
}

export const GROUND_LIMIT = 512;
export const GROUND_BAIT_TYPES = Object.freeze({
  sugar: { radius: 0.15, cost: 3, mealSeconds: 4 },
});
export const GROUND_WALL_HP = 100;
export const GROUND_WALL_COST_PER_SEGMENT = WALL_SEGMENT_PRICE;
export const GROUND_STICKY_COST_PER_20CM = 1;
// Walls: $0.25/48 mm after half-brick snapping. Tape: unchanged $1/20 cm.
// Both use the existing cent precision and never round up to a full section.
export function lengthPrice(kind: string, distance: number): number {
  if (kind === 'barricade') distance = wallLength(distance);
  const rate = kind === 'barricade' ? GROUND_WALL_COST_PER_SEGMENT : GROUND_STICKY_COST_PER_20CM;
  return Math.max(
    0.01,
    Math.round((distance / (kind === 'barricade' ? WALL_SEGMENT : 0.2)) * rate * 100) / 100,
  );
}

export function feedingPoint(bait: { angle?: number; position: GroundPoint }): number[] {
  const angle = bait.angle || 0;
  return [bait.position[0] + Math.sin(angle) * 0.024, bait.position[1] + Math.cos(angle) * 0.024];
}
export function newGroundDefense(): GroundDefenseState {
  return {
    revision: 0,
    navigationRevision: 0,
    nextId: 0,
    structures: [],
    drops: [], // Castor volant constructions still falling (server-owned)
    dropSeq: 0,
  };
}
function finitePoint(p: unknown): p is number[] {
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
function length(a: GroundPoint, b: GroundPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function nearFoot(point: GroundPoint, foot: GroundPoint | null | undefined): boolean {
  return (
    Number.isFinite(foot?.[0]) &&
    Number.isFinite(foot?.[1]) &&
    Math.hypot(point[0] - foot![0], point[1] - foot![1]) <= 0.27
  );
}
function fail(message: string): never {
  throw new Error(message);
}
export function groundSnapshot(state: GroundDefenseState, now: number = Date.now()) {
  return {
    revision: state.revision,
    navigationRevision: state.navigationRevision,
    structures: structuredClone(state.structures),
    ...(state.drops?.length
      ? {
          drops: state.drops.map(({ id, kind, command, x, z, angle, fromY, landingY, startedAt }) =>
            structuredClone({ id, kind, command, x, z, angle, fromY, landingY, startedAt }),
          ),
        }
      : {}),
  };
}
// Structures that block ground movement (and that ground insects may break).
export const BLOCKING_KINDS = Object.freeze(['barricade']);
export function navigationStructures(
  structures: readonly GroundStructure[] = [],
): GroundStructure[] {
  return structures.filter((s) => BLOCKING_KINDS.includes(s.kind) && s.hp! > 0 && onFloor(s));
}
// What floor walkers meet (walls, tape, sugar): never constructions on furniture.
export const floorStructures = (structures: readonly GroundStructure[] = []): GroundStructure[] =>
  structures.filter(onFloor);
// Blocking pieces a local build draft would add, mirroring groundCommand.
export function previewStructures(
  command: { kind?: unknown; a?: GroundPoint; b?: GroundPoint } | null | undefined,
) {
  if (command?.kind === 'barricade' && command.a && command.b)
    return splitBarricade(command.a, command.b, 'preview').map((piece) => ({
      ...piece,
      kind: 'barricade',
      hp: GROUND_WALL_HP,
    }));
  return [];
}
export function groundFlow(
  state: Pick<GroundDefenseState, 'structures'>,
  goal: GroundPoint = groundGoal(),
) {
  return buildGroundFlow({
    bounds: GROUND_BOUNDS,
    cellSize: GROUND_CELL,
    goal,
    // Blocking structures are barricades: they always carry both ends.
    barricades: navigationStructures(state.structures) as { a: GroundPoint; b: GroundPoint }[],
    staticObstacles: groundStaticObstacles(),
  });
}
// One synchronous command is an atomic room transaction. Never accept costs, HP,
// owners, revision numbers or placement identities from network clients.
export function groundCommand(
  state: GroundDefenseState,
  command: GroundCommand,
  foot: GroundPoint | null | undefined,
  dollars: number,
  now: number = Date.now(),
  access: GroundAccess = {},
): GroundTransaction {
  if (!state || !command || typeof command !== 'object' || !Number.isFinite(dollars))
    fail('Commande de défense invalide.');
  const action = command.action;
  if (action === 'build') {
    const { kind, a } = command as { kind: string; a: number[] };
    let { b } = command as { b: number[] };
    const pointItem = kind === 'sugar' || isTurret(kind) || isFortification(kind);
    if (isFortification(kind)) {
      if (!access.castor) fail('Cette défense occupable se construit depuis le Castor.');
      if (state.structures.filter((s) => s.kind === kind).length >= FORTIFICATIONS[kind].maxPerRoom)
        fail('Nombre maximal de défenses occupables atteint.');
    }
    if (isTurret(kind)) {
      if (!access.castor) fail('Cette tourelle se construit depuis le Castor.');
      if (state.structures.filter((s) => isTurret(s.kind)).length >= SENTRY.maxPerRoom)
        fail('Nombre maximal de tourelles atteint.');
    }
    if (
      !['barricade', 'sticky', 'sugar', 'sentry', 'antitank'].includes(kind) ||
      !finitePoint(a) ||
      (!pointItem && !finitePoint(b))
    )
      fail('Emplacement de construction invalide.');
    if (!nearFoot(a, foot) && (pointItem || !nearFoot(b, foot)))
      fail('Construisez à proximité de votre personnage.');
    if (kind === 'barricade') {
      const d = length(a, b),
        span = wallLength(d);
      if (span < HALF_BRICK) fail('Tracez au moins une demi-brique (12 mm).');
      b = a.map((v, k) => v + ((b[k] - v) * span) / d);
    }
    const distance = pointItem ? 0 : length(a, b);
    if (!pointItem && distance < 0.002) fail('Tracez la construction depuis votre position.');
    const count = kind === 'barricade' ? Math.ceil((distance - 1e-9) / WALL_SEGMENT) : 1;
    if (state.structures.length + count > GROUND_LIMIT)
      fail('Trop de constructions dans la salle.');
    const price = isFortification(kind)
      ? FORTIFICATIONS[kind].cost
      : isTurret(kind)
        ? turretSpec(kind).cost
        : kind === 'sugar'
          ? GROUND_BAIT_TYPES.sugar.cost
          : lengthPrice(kind, distance);
    if (dollars + 1e-8 < price) fail('Caisse commune insuffisante.');
    // Castor volant drops land on furniture too: those keep their height.
    const level = Number.isFinite(access.y) && access.y! > FLOOR_LEVEL ? access.y! : 0;
    const id = String(state.nextId + 1);
    const items: GroundStructure[] =
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
                angle: Number.isFinite(command.angle)
                  ? (command.angle as number) % (2 * Math.PI)
                  : 0,
                ...(isTurret(kind)
                  ? {
                      hp: turretSpec(kind).hp,
                      maxHp: turretSpec(kind).hp,
                      ammo: turretSpec(kind).ammo,
                    }
                  : isFortification(kind)
                    ? {
                        hp: FORTIFICATIONS[kind].hp,
                        maxHp: FORTIFICATIONS[kind].hp,
                        ammo: FORTIFICATIONS[kind].ammo,
                      }
                    : { type: 'sugar', radius: GROUND_BAIT_TYPES.sugar.radius }),
              },
            ];
    if (level) for (const item of items) item.y = level;
    if (kind === 'sugar' && !finitePoint(feedingPoint(items[0] as { position: number[] })))
      fail('Les cristaux dépassent du bureau.');
    // Validate collisions with existing barricades, preserving adjacent segments
    // of the same stroke; bail out before spending anything.
    for (const item of items) {
      const sample = item.position
        ? item.position
        : [(item.a![0] + item.b![0]) / 2, (item.a![1] + item.b![1]) / 2];
      if (
        state.structures.some((existing) => {
          // Only constructions on the same surface (floor or furniture) collide.
          if (Math.abs(levelOf(existing) - level) > 0.02) return false;
          if ((isTurret(existing.kind) || existing.kind === 'antitank') && existing.hp! > 0)
            return (
              Math.hypot(sample[0] - existing.position![0], sample[1] - existing.position![1]) <
              (isTurret(existing.kind)
                ? turretSpec(existing.kind).footprint
                : FORTIFICATIONS.antitank.footprint)
            );
          if (existing.kind !== 'barricade' || existing.hp! <= 0) return false;
          if (!item.position) {
            const joins = [item.a!, item.b!].some((p) =>
              [existing.a!, existing.b!].some((q) => length(p, q) < 1e-7),
            );
            if (joins) {
              const shared = [item.a!, item.b!].find((p) =>
                [existing.a!, existing.b!].some((q) => length(p, q) < 1e-7),
              )!;
              const own = length(shared, item.a!) > 1e-7 ? item.a! : item.b!;
              const other = length(shared, existing.a!) > 1e-7 ? existing.a! : existing.b!;
              const dot =
                (own[0] - shared[0]) * (other[0] - shared[0]) +
                (own[1] - shared[1]) * (other[1] - shared[1]);
              if (dot <= 1e-10) return false;
            }
          }
          return distanceToSegment(sample, existing.a!, existing.b!) < 0.02;
        })
      )
        fail('Emplacement déjà occupé par une construction.');
    }
    state.nextId++;
    state.structures.push(...items);
    state.revision++;
    if (kind === 'barricade' && !level) state.navigationRevision++;
    return { price, ids: items.map((item) => item.id) };
  }
  if (!['repair', 'remove', 'upgrade'].includes(action as string))
    fail('Action de défense inconnue.');
  if (typeof command.id !== 'string') fail('Identifiant de construction invalide.');
  const index = state.structures.findIndex((s) => s.id === command.id);
  if (index < 0) fail('Construction introuvable.');
  const item = state.structures[index];
  const position = item.position || [(item.a![0] + item.b![0]) / 2, (item.a![1] + item.b![1]) / 2];
  if (!nearFoot(position, foot)) fail('Approchez-vous de la construction.');
  if (action === 'upgrade') {
    // Refit into a variant of the tree (src/ground-sentry.ts): fully repaired and
    // reloaded, for the price of the variant. Never a downgrade, never a sidestep.
    const variant = command.variant as TurretKind;
    if (!isTurret(item.kind) || item.hp! <= 0 || !upgradesOf(item.kind).includes(variant))
      fail('Cette tourelle ne peut pas être améliorée.');
    const price = upgradeCost(variant);
    if (dollars + 1e-8 < price) fail('Caisse commune insuffisante.');
    const spec = turretSpec(variant);
    Object.assign(item, { kind: variant, hp: spec.hp, maxHp: spec.hp, ammo: spec.ammo });
    delete item.lastShotAt;
    delete item.aimTarget;
    state.revision++;
    return { price, ids: [item.id] };
  }
  if (action === 'repair') {
    if (
      !['barricade', 'sentry', 'gatling', 'antitank'].includes(item.kind) ||
      item.hp! <= 0 ||
      item.hp! >= item.maxHp!
    )
      fail('Ce segment ne peut pas être réparé.');
    if (dollars < 1) fail('Caisse commune insuffisante.');
    item.hp = item.maxHp;
    state.revision++;
    return { price: 1, ids: [item.id] };
  }
  state.structures.splice(index, 1);
  state.revision++;
  if (item.kind === 'barricade') state.navigationRevision++;
  return { price: 0, ids: [item.id] };
}
// Invoked by authoritative server combat only; never expose as a network command.
export function damageBarricade(state: GroundDefenseState, id: string, damage: number): boolean {
  if (!Number.isFinite(damage) || damage <= 0) fail('Dégâts invalides.');
  const item = state.structures.find((s) => s.id === id && s.kind === 'barricade');
  if (!item || item.hp! <= 0) return false;
  item.hp = Math.max(0, item.hp! - damage);
  state.revision++;
  if (item.hp === 0) state.navigationRevision++;
  return item.hp === 0;
}
